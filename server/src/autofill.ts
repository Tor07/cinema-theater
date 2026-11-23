import { DEMO_MODE } from './env.js';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { DB_FILL_LOCK, SchedulePlanner, dayStart, type Rnd } from './schedule.js';
import { seatPrice } from './pricing.js';
import { CUSTOMERS } from './seed-utils.js';

// Горизонт расписания: столько дней вперёд всегда должно быть заполнено.
export const SCHEDULE_DAYS = 7;

const dayIndexOf = (d: Date): number => {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((local - dayStart(0).getTime()) / 86_400_000);
};

/**
 * Держит расписание актуальным: любые дни горизонта [сегодня, +SCHEDULE_DAYS),
 * где нет сеансов, заполняются автоматически (при старте сервера и по таймеру).
 * Благодаря этому приложение, запущенное спустя месяцы после сида, показывает
 * афишу на свои реальные текущие даты, а не на даты давнего сида.
 *
 * Весь проход — одна транзакция под advisory-блокировкой: параллельные запуски
 * (рестарт dev-сервера, часовой таймер, ручной npm run autofill) сериализуются,
 * второй увидит уже заполненные дни и не создаст дублей. Демо-заказы для новых
 * сеансов создаются только при DEMO_MODE и помечаются isDemo.
 */
export async function ensureUpcomingSchedule(): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DB_FILL_LOCK})`;

      const [halls, movies, inWindow, seats] = await Promise.all([
        tx.hall.findMany({ select: { id: true } }),
        tx.movie.findMany({ select: { id: true, durationMin: true } }),
        tx.session.findMany({
          where: { startsAt: { gte: dayStart(0), lt: dayStart(SCHEDULE_DAYS) } },
          select: { movieId: true, hallId: true, startsAt: true, movie: { select: { durationMin: true } } },
        }),
        tx.seat.findMany({ select: { id: true, hallId: true, row: true, number: true, tier: true } }),
      ]);
      if (halls.length === 0 || movies.length === 0) return 0;

      const filled = new Set(inWindow.map((s) => dayIndexOf(s.startsAt)));
      const served = new Map<number, number>();
      for (const s of inWindow) served.set(s.movieId, (served.get(s.movieId) ?? 0) + 1);
      const missing: number[] = [];
      for (let day = 0; day < SCHEDULE_DAYS; day++) if (!filled.has(day)) missing.push(day);
      if (missing.length === 0) return 0;

      const rnd: Rnd = Math.random;
      const planner = new SchedulePlanner(
        halls.map((h) => h.id),
        SCHEDULE_DAYS,
      );
      for (const r of inWindow) planner.reserve(r.hallId, r.startsAt, r.movie.durationMin);

      const seatsByHall = new Map<number, typeof seats>();
      for (const s of seats) {
        const list = seatsByHall.get(s.hallId) ?? [];
        list.push(s);
        seatsByHall.set(s.hallId, list);
      }

      const created: { id: number; hallId: number; base: number }[] = [];
      // Слотов в залах меньше, чем фильмов: день заполняется случайной частью каталога,
      // иначе в афишу попадали бы всегда одни и те же первые фильмы.
      const PER_DAY = 14;
      for (const day of missing) {
        const order = movies.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        // Сначала фильмы, которых в расписании меньше всего; среди равных —
        // длинные, им нужно большое свободное окно в зале.
        order.sort(
          (a, b) =>
            (served.get(movies[a].id) ?? 0) - (served.get(movies[b].id) ?? 0) ||
            movies[b].durationMin - movies[a].durationMin,
        );
        let placed = 0;
        for (const mi of order) {
          if (placed >= PER_DAY) break;
          const m = movies[mi];
          const slot = planner.place(m.durationMin, day, rnd);
          if (!slot) continue;
          placed++;
          const base = 300 + Math.floor(rnd() * 6) * 50;
          const s = await tx.session.create({
            data: { movieId: m.id, hallId: slot.hallId, startsAt: slot.startsAt, basePrice: base },
            select: { id: true },
          });
          served.set(m.id, (served.get(m.id) ?? 0) + 1);
          created.push({ id: s.id, hallId: slot.hallId, base });
        }
      }

      if (DEMO_MODE) {
        let orderNo = 0;
        for (const s of created) {
          const free = [...(seatsByHall.get(s.hallId) ?? [])];
          const ordersForSession = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < ordersForSession; i++) {
            const cnt = Math.min(free.length, 3 + Math.floor(rnd() * 7));
            const picked: typeof free = [];
            for (let k = 0; k < cnt; k++) picked.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
            if (picked.length === 0) break;
            const total = picked.reduce((sum, p) => sum + seatPrice(s.base, p.tier), 0);
            const c = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
            const code =
              'AF-' + randomBytes(3).toString('hex').toUpperCase() + (orderNo++).toString(36).toUpperCase();
            await tx.order.create({
              data: {
                code,
                sessionId: s.id,
                customerName: c.name,
                email: c.email,
                phone: c.phone,
                total,
                status: rnd() < 0.8 ? 'confirmed' : 'new',
                isDemo: true,
                createdAt: new Date(),
                items: {
                  create: picked.map((p) => ({
                    sessionId: s.id,
                    seatId: p.id,
                    row: p.row,
                    number: p.number,
                    tier: p.tier,
                    price: seatPrice(s.base, p.tier),
                  })),
                },
              },
              select: { id: true },
            });
          }
        }
      }

      console.log(
        `[autofill] schedule extended: ${created.length} sessions for days ${missing.join(', ')}` +
          (DEMO_MODE ? '' : ' (demo orders off)'),
      );
      return created.length;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('autofill.ts');
if (isMain) {
  ensureUpcomingSchedule()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
