import './env.js';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';
import { DB_FILL_LOCK, SchedulePlanner } from './schedule.js';
import { seatPrice } from './pricing.js';
import { CUSTOMERS, TOP10, mulberry32, type SeatLite } from './seed-utils.js';

// Топ-10 фильмов по версии Кинопоиска — те же записи единого каталога
// (data/movies.json), отобранные по kpRank; отдельных данных здесь нет.
export async function seedTopFilms(planner?: SchedulePlanner) {
  const rnd = mulberry32(20261123);
  const plan =
    planner ??
    (await SchedulePlanner.load(
      (await prisma.hall.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map((h) => h.id),
      7,
    ));
  let added = 0;
  let sessionsAdded = 0;
  let ordersAdded = 0;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DB_FILL_LOCK})`;
      const halls = await tx.hall.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const seatsByHall = new Map<number, SeatLite[]>();
      for (const h of halls) {
        const s = await tx.seat.findMany({
          where: { hallId: h.id },
          select: { id: true, tier: true, row: true, number: true },
          orderBy: [{ row: 'asc' }, { number: 'asc' }],
        });
        seatsByHall.set(h.id, s);
      }

      // Длинные фильмы ставим первыми: им нужно большое свободное окно в зале,
      // а короткие сеансы успеют занять оставшиеся промежутки.
      for (const m of [...TOP10].sort((a, b) => b.durationMin - a.durationMin)) {
        const existing = await tx.movie.findFirst({
          where: { title: m.title },
          include: { _count: { select: { sessions: true } } },
        });

        let movieId: number;
        if (existing) {
          movieId = existing.id;
          // Каталог — источник правды для топа: синхронизируем место, рейтинг и постер.
          await tx.movie.update({
            where: { id: movieId },
            data: { kpRank: m.kpRank, rating: m.rating, posterUrl: m.posterUrl },
          });
        } else {
          const created = await tx.movie.create({
            data: {
              title: m.title,
              originalTitle: m.originalTitle,
              year: m.year,
              genre: m.genre,
              ageRating: m.ageRating,
              durationMin: m.durationMin,
              director: m.director,
              screenwriter: m.screenwriter,
              cast: m.cast,
              description: m.description,
              posterUrl: m.posterUrl,
              trailerUrl: m.trailerUrl,
              rating: m.rating,
              kpRank: m.kpRank,
            },
            select: { id: true },
          });
          movieId = created.id;
          added++;
        }

        const hasSessions = existing ? existing._count.sessions > 0 : false;
        if (hasSessions) continue;

        const newSessions: { id: number; hallId: number; base: number }[] = [];
        const days = [0, 1, 2, 3, 4, 5, 6];
        for (let i = days.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [days[i], days[j]] = [days[j], days[i]];
        }
        for (const day of days) {
          if (newSessions.length >= 4) break;
          const slot = plan.place(m.durationMin, day, rnd);
          if (!slot) continue;
          const base = 300 + Math.floor(rnd() * 6) * 50;
          const s = await tx.session.create({
            data: { movieId, hallId: slot.hallId, startsAt: slot.startsAt, basePrice: base },
            select: { id: true },
          });
          newSessions.push({ id: s.id, hallId: slot.hallId, base });
          sessionsAdded++;
        }

        const statuses = ['confirmed', 'confirmed', 'new', 'cancelled'];
        for (const s of newSessions) {
          const free = [...seatsByHall.get(s.hallId)!];
          const ordersForSession = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < ordersForSession; i++) {
            const cnt = Math.min(free.length, 3 + Math.floor(rnd() * 7));
            const picked: SeatLite[] = [];
            for (let k = 0; k < cnt; k++) picked.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
            if (picked.length === 0) break;
            const total = picked.reduce((sum, p) => sum + seatPrice(s.base, p.tier), 0);
            const c = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
            const code = 'KP-' + randomBytes(4).toString('hex').toUpperCase();
            const status = statuses[Math.floor(rnd() * statuses.length)];
            await tx.order.create({
              data: {
                code,
                sessionId: s.id,
                customerName: c.name,
                email: c.email,
                phone: c.phone,
                total,
                status,
                isDemo: true,
                createdAt: new Date(Date.now() - Math.floor(rnd() * 3 * 86_400_000)),
                items: {
                  create: picked.map((p) => ({
                    sessionId: s.id,
                    seatId: p.id,
                    row: p.row,
                    number: p.number,
                    tier: p.tier,
                    price: seatPrice(s.base, p.tier),
                    active: status !== 'cancelled',
                  })),
                },
              },
              select: { id: true },
            });
            ordersAdded++;
          }
        }
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  console.log(`[db] top-10 seed: +${added} movies, +${sessionsAdded} sessions, +${ordersAdded} orders`);
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed-top.ts');
if (isMain) {
  seedTopFilms()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
