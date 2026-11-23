import { Router } from 'express';
import type { Hall, Movie, Prisma, Session } from '@prisma/client';
import { prisma } from '../prisma.js';
import { soldSeatsFor, soldSeatsMap } from '../sold-seats.js';
import { notFound } from '../errors.js';
import { idParam, parse, sessionsQuery } from '../validation.js';
import { seatPrice, TIER_LABEL } from '../pricing.js';
import { dateKeyToDay, dayStart, nextDayStart, toDateKey } from '../schedule.js';
import { pageMeta, skipTake } from '../pagination.js';

export const sessionsRouter = Router();

type SessionWithRels = Session & { movie: Movie; hall: Hall };

const toSessionDto = (s: SessionWithRels, soldSeats: number) => ({
  id: s.id,
  startsAt: s.startsAt.toISOString(),
  basePrice: s.basePrice,
  hall: { id: s.hall.id, name: s.hall.name, totalSeats: s.hall.rows * s.hall.seatsPerRow },
  soldSeats,
  movie: {
    id: s.movie.id,
    title: s.movie.title,
    originalTitle: s.movie.originalTitle,
    year: s.movie.year,
    genre: s.movie.genre,
    ageRating: s.movie.ageRating,
    durationMin: s.movie.durationMin,
    posterUrl: s.movie.posterUrl,
    rating: Number(s.movie.rating),
    kpRank: s.movie.kpRank,
  },
});

sessionsRouter.get('/sessions', async (req, res, next) => {
  try {
    const f = parse(sessionsQuery, req.query);

    const where: Prisma.SessionWhereInput = {};
    const movieAnd: Prisma.MovieWhereInput[] = [];
    if (f.q) {
      movieAnd.push({
        OR: [
          { title: { contains: f.q, mode: 'insensitive' } },
          { originalTitle: { contains: f.q, mode: 'insensitive' } },
        ],
      });
    }
    if (f.genre) movieAnd.push({ genre: f.genre });
    if (f.ageRating != null) movieAnd.push({ ageRating: f.ageRating });
    if (f.movieId != null) movieAnd.push({ id: f.movieId });
    if (f.top) movieAnd.push({ kpRank: { not: null } });
    if (movieAnd.length) where.movie = { AND: movieAnd };
    if (f.date) {
      // Окно — локальные сутки сервера (те же, в которых планировщик ставит сеансы).
      const day = dateKeyToDay(f.date);
      where.startsAt = { gte: day, lt: nextDayStart(day) };
    } else {
      where.startsAt = { gte: dayStart(0) };
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        ...skipTake(f),
        include: { movie: true, hall: true },
        orderBy: [{ startsAt: 'asc' }, { movie: { title: 'asc' } }],
      }),
      prisma.session.count({ where }),
    ]);
    const sold = await soldSeatsMap(sessions.map((s) => s.id));

    res.json({
      items: sessions.map((s) => toSessionDto(s, sold.get(s.id) ?? 0)),
      total,
      ...pageMeta(f, sessions.length),
    });
  } catch (e) {
    next(e);
  }
});

sessionsRouter.get('/filters', async (_req, res, next) => {
  try {
    const [genres, ages, sessions, halls] = await Promise.all([
      prisma.movie.findMany({ distinct: ['genre'], select: { genre: true }, orderBy: { genre: 'asc' } }),
      prisma.movie.findMany({
        distinct: ['ageRating'],
        select: { ageRating: true },
        orderBy: { ageRating: 'asc' },
      }),
      prisma.session.findMany({
        select: { startsAt: true },
        where: { startsAt: { gte: dayStart(0) } },
        orderBy: { startsAt: 'asc' },
      }),
      prisma.hall.findMany({ select: { name: true }, orderBy: { id: 'asc' } }),
    ]);
    const dates = [...new Set(sessions.map((s) => toDateKey(s.startsAt)))];
    res.json({
      genres: genres.map((g) => g.genre),
      ageRatings: ages.map((a) => a.ageRating),
      dates,
      halls: halls.map((h) => h.name),
    });
  } catch (e) {
    next(e);
  }
});

sessionsRouter.get('/sessions/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const s = await prisma.session.findUnique({ where: { id }, include: { movie: true, hall: true } });
    if (!s) throw notFound('Сеанс');

    const [sold, others] = await Promise.all([
      soldSeatsFor(id),
      prisma.session.findMany({
        where: { movieId: s.movieId, id: { not: id }, startsAt: { gte: dayStart(0) } },
        include: { movie: true, hall: true },
        orderBy: { startsAt: 'asc' },
        take: 14,
      }),
    ]);
    const othersSold = await soldSeatsMap(others.map((o) => o.id));

    const m = s.movie;
    res.json({
      ...toSessionDto(s, sold),
      movie: {
        id: m.id,
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
        rating: Number(m.rating),
        kpRank: m.kpRank,
      },
      otherSessions: others.map((o) => toSessionDto(o, othersSold.get(o.id) ?? 0)),
    });
  } catch (e) {
    next(e);
  }
});

sessionsRouter.get('/sessions/:id/seats', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const s = await prisma.session.findUnique({ where: { id }, include: { hall: true } });
    if (!s) throw notFound('Сеанс');
    const hall = s.hall;

    const [seats, takenItems] = await Promise.all([
      prisma.seat.findMany({ where: { hallId: hall.id }, orderBy: [{ row: 'asc' }, { number: 'asc' }] }),
      prisma.orderItem.findMany({
        where: { sessionId: id, order: { status: { not: 'cancelled' } } },
        select: { seatId: true },
      }),
    ]);
    const taken = new Set(takenItems.map((t) => t.seatId));

    const tiers = ['standard', 'comfort', 'vip']
      .filter((t) => seats.some((x) => x.tier === t))
      .map((t) => ({ tier: t, label: TIER_LABEL[t], price: seatPrice(s.basePrice, t) }));

    res.json({
      sessionId: id,
      hall: { id: hall.id, name: hall.name, rows: hall.rows, seatsPerRow: hall.seatsPerRow },
      tiers,
      seats: seats.map((x) => ({
        id: x.id,
        row: x.row,
        number: x.number,
        tier: x.tier,
        price: seatPrice(s.basePrice, x.tier),
        occupied: taken.has(x.id),
      })),
    });
  } catch (e) {
    next(e);
  }
});
