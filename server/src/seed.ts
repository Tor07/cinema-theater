import { ADMIN_LOGIN, ADMIN_PASSWORD } from './env.js';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { seedTopFilms } from './seed-top.js';
import { DB_FILL_LOCK, SchedulePlanner } from './schedule.js';
import { seatPrice } from './pricing.js';
import { CUSTOMERS, MOVIES, mulberry32, type SeatLite } from './seed-utils.js';

const HALLS = [
  {
    name: 'Большой зал',
    rows: 10,
    perRow: 14,
    tiers: (r: number) => (r <= 4 ? 'standard' : r <= 7 ? 'comfort' : 'vip'),
  },
  { name: 'Камерный зал', rows: 9, perRow: 12, tiers: (r: number) => (r <= 4 ? 'standard' : 'comfort') },
  { name: 'Зал «Люкс»', rows: 8, perRow: 13, tiers: (r: number) => (r <= 3 ? 'comfort' : 'vip') },
];

export async function initDb() {
  // Сид только недостающего: админ, залы и каталог восстанавливаются независимо,
  // поэтому частичное удаление данных (например, всех фильмов) не приводит
  // к дублям и отказу старта. Advisory-lock сериализует параллельные запуски.
  let seededCatalog = false;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DB_FILL_LOCK})`;

      const admin = await tx.admin.findUnique({ where: { login: ADMIN_LOGIN }, select: { id: true } });
      if (!admin) {
        const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await tx.admin.create({ data: { login: ADMIN_LOGIN, passwordHash: hash } });
        // Пароль в лог не пишем — только логин.
        console.log(`[db] admin restored: ${ADMIN_LOGIN}`);
      }

      const hallSeats: { hallId: number; seats: SeatLite[] }[] = [];
      for (const h of HALLS) {
        let hall = await tx.hall.findFirst({ where: { name: h.name }, select: { id: true } });
        if (!hall) {
          hall = await tx.hall.create({
            data: { name: h.name, rows: h.rows, seatsPerRow: h.perRow },
            select: { id: true },
          });
          console.log(`[db] hall restored: ${h.name}`);
        }
        const seatCount = await tx.seat.count({ where: { hallId: hall.id } });
        if (seatCount === 0) {
          const seatData = [];
          for (let row = 1; row <= h.rows; row++) {
            for (let num = 1; num <= h.perRow; num++) {
              seatData.push({ hallId: hall.id, row, number: num, tier: h.tiers(row) });
            }
          }
          await tx.seat.createMany({ data: seatData });
        }
        const seats = await tx.seat.findMany({
          where: { hallId: hall.id },
          select: { id: true, row: true, number: true, tier: true },
        });
        hallSeats.push({ hallId: hall.id, seats });
      }

      const movieCount = await tx.movie.count();
      if (movieCount > 0) return; // каталог на месте — сеансы дозаполнит автофилл

      seededCatalog = true;
      console.log('[db] seeding catalog…');
      const rnd = mulberry32(20261122);

      // Единый каталог из data/movies.json (базовая афиша + топ-10 Кинопоиска).
      const movieIds: number[] = [];
      for (const m of MOVIES) {
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
        movieIds.push(created.id);
      }

      const planner = new SchedulePlanner(
        hallSeats.map((h) => h.hallId),
        7,
      );
      const sessionIds: { id: number; hallId: number; base: number }[] = [];

      // Слотов в залах меньше, чем фильмов, поэтому каждый день афиша формируется
      // из случайной части списка — иначе последние фильмы никогда не попали бы в расписание.
      const PER_DAY = 7;
      const shown = new Array(movieIds.length).fill(0);
      for (let day = 0; day < 7; day++) {
        const order = movieIds.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        // Сначала фильмы, которых в афише меньше всего; среди равных — длинные,
        // им нужно большое свободное окно в зале.
        order.sort((a, b) => shown[a] - shown[b] || MOVIES[b].durationMin - MOVIES[a].durationMin);
        let placed = 0;
        for (const mi of order) {
          if (placed >= PER_DAY) break;
          const slot = planner.place(MOVIES[mi].durationMin, day, rnd);
          if (!slot) continue;
          placed++;
          const base = 300 + Math.floor(rnd() * 6) * 50;
          const s = await tx.session.create({
            data: { movieId: movieIds[mi], hallId: slot.hallId, startsAt: slot.startsAt, basePrice: base },
            select: { id: true },
          });
          shown[mi]++;
          sessionIds.push({ id: s.id, hallId: slot.hallId, base });
        }
      }

      const statuses = ['confirmed', 'confirmed', 'confirmed', 'new', 'cancelled'];
      let orderNo = 0;
      for (const s of sessionIds) {
        const free = [...hallSeats.find((h) => h.hallId === s.hallId)!.seats];
        const ordersForSession = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < ordersForSession; i++) {
          const cnt = Math.min(free.length, 3 + Math.floor(rnd() * 7));
          const picked: SeatLite[] = [];
          for (let k = 0; k < cnt; k++) {
            picked.push(free.splice(Math.floor(rnd() * free.length), 1)[0]);
          }
          if (picked.length === 0) break;
          const total = picked.reduce((sum, p) => sum + seatPrice(s.base, p.tier), 0);
          const c = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
          const status = statuses[Math.floor(rnd() * statuses.length)];
          const created = new Date(Date.now() - Math.floor(rnd() * 4 * 86_400_000));
          const code =
            'AV-' +
            (100000 + Math.floor(rnd() * 900000)).toString(36).toUpperCase().padStart(6, 'X') +
            (orderNo++).toString(36).toUpperCase();
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
              createdAt: created,
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
        }
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  if (seededCatalog) {
    console.log(`[db] seed complete: halls, sessions for 7 days, demo orders, admin: ${ADMIN_LOGIN}`);
    await seedTopFilms();
  }
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('seed.ts');
if (isMain) {
  initDb()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
