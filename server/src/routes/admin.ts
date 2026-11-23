import { Router } from 'express';
import type { Hall, Movie, Prisma, Session } from '@prisma/client';
import { prisma } from '../prisma.js';
import { soldSeatsFor, soldSeatsMap } from '../sold-seats.js';
import { ApiError, isSeatUniqueViolation, notFound } from '../errors.js';
import {
  adminListQuery,
  adminOrdersQuery,
  idParam,
  movieBody,
  moviePatchBody,
  orderStatusBody,
  parse,
  sessionBody,
  sessionPatchBody,
} from '../validation.js';
import { requireAdmin } from '../middleware/auth.js';
import { dayStart, findHallConflict } from '../schedule.js';
import { pageMeta, skipTake } from '../pagination.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAdmin);

type SessionWithRels = Session & { movie: Movie; hall: Hall };
type MovieWithCount = Movie & { _count: { sessions: number } };

/* ---------- orders ---------- */

adminRouter.get('/admin/orders', async (req, res, next) => {
  try {
    const f = parse(adminOrdersQuery, req.query);
    const where: Prisma.OrderWhereInput = {};
    if (f.status) where.status = f.status;
    if (f.q) {
      const q = f.q;
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { session: { movie: { title: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        ...skipTake(f),
        include: {
          session: {
            include: {
              movie: { select: { title: true, posterUrl: true } },
              hall: { select: { name: true } },
            },
          },
          items: { orderBy: [{ row: 'asc' }, { number: 'asc' }] },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      items: orders.map((o) => ({
        id: o.id,
        code: o.code,
        customer: { name: o.customerName, email: o.email, phone: o.phone },
        total: o.total,
        status: o.status,
        isDemo: o.isDemo,
        createdAt: o.createdAt.toISOString(),
        session: {
          id: o.session.id,
          startsAt: o.session.startsAt.toISOString(),
          movieTitle: o.session.movie.title,
          posterUrl: o.session.movie.posterUrl,
          hallName: o.session.hall.name,
        },
        seats: o.items.map((i) => ({
          seatId: i.seatId,
          row: i.row,
          number: i.number,
          tier: i.tier,
          price: i.price,
        })),
      })),
      total,
      ...pageMeta(f, orders.length),
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.get('/admin/stats', async (_req, res, next) => {
  try {
    // «Сегодня» — локальные сутки сервера, как и во всём расписании.
    // Статистика — только по реальным заказам: демо-заказы (isDemo) не учитываются.
    const todayStart = dayStart(0);
    const tomorrowStart = dayStart(1);
    const real = { isDemo: false };

    const [ordersTotal, ordersNew, ordersConfirmed, ordersCancelled, revenue, revenueToday, ticketsSold] =
      await Promise.all([
        prisma.order.count({ where: real }),
        prisma.order.count({ where: { ...real, status: 'new' } }),
        prisma.order.count({ where: { ...real, status: 'confirmed' } }),
        prisma.order.count({ where: { ...real, status: 'cancelled' } }),
        prisma.order.aggregate({ where: { ...real, status: { not: 'cancelled' } }, _sum: { total: true } }),
        prisma.order.aggregate({
          where: { ...real, status: { not: 'cancelled' }, createdAt: { gte: todayStart, lt: tomorrowStart } },
          _sum: { total: true },
        }),
        prisma.orderItem.count({ where: { order: { ...real, status: { not: 'cancelled' } } } }),
      ]);

    res.json({
      orders_total: ordersTotal,
      orders_new: ordersNew,
      orders_confirmed: ordersConfirmed,
      orders_cancelled: ordersCancelled,
      revenue: revenue._sum.total ?? 0,
      revenue_today: revenueToday._sum.total ?? 0,
      ticketsSold,
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/admin/orders/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const { status } = parse(orderStatusBody, req.body);
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: { id: true, sessionId: true, status: true },
      });
      if (!order) throw notFound('Заказ');
      if (order.status === status) return;

      // Возврат из «отменён» в активный статус снова занимает места:
      // под блокировкой сеанса проверяем, что их не продали другим заказам.
      if (order.status === 'cancelled') {
        await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${order.sessionId} FOR UPDATE`;
        const items = await tx.orderItem.findMany({ where: { orderId: id }, select: { seatId: true } });
        const taken = await tx.orderItem.findMany({
          where: {
            sessionId: order.sessionId,
            seatId: { in: items.map((i) => i.seatId) },
            orderId: { not: id },
            order: { status: { not: 'cancelled' } },
          },
          select: { seatId: true },
        });
        if (taken.length > 0) {
          throw new ApiError(
            409,
            'Нельзя вернуть заказ в активный статус: его места уже проданы другим заказам',
            {
              seatIds: taken.map((t) => t.seatId),
            },
          );
        }
      }
      await tx.order.update({ where: { id }, data: { status } });
      // Зеркалим признак для частичного уникального индекса (см. db-indexes.ts).
      await tx.orderItem.updateMany({ where: { orderId: id }, data: { active: status !== 'cancelled' } });
    });
    res.json({ id, status });
  } catch (e) {
    if (isSeatUniqueViolation(e)) {
      next(new ApiError(409, 'Нельзя вернуть заказ в активный статус: его места уже проданы другим заказам'));
      return;
    }
    next(e);
  }
});

adminRouter.delete('/admin/orders/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('Заказ');
    await prisma.order.delete({ where: { id } });
    res.json({ id, deleted: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- movies ---------- */

const mapMovie = (m: MovieWithCount) => ({
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
  sessionsCount: m._count.sessions,
});

const fetchMovie = async (id: number): Promise<MovieWithCount> => {
  const m = await prisma.movie.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true } } },
  });
  if (!m) throw notFound('Фильм');
  return m;
};

adminRouter.get('/admin/movies', async (req, res, next) => {
  try {
    const f = parse(adminListQuery, req.query);
    const where: Prisma.MovieWhereInput = {};
    if (f.q) {
      where.OR = [
        { title: { contains: f.q, mode: 'insensitive' } },
        { originalTitle: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    const [movies, total] = await Promise.all([
      prisma.movie.findMany({
        where,
        ...skipTake(f),
        include: { _count: { select: { sessions: true } } },
        orderBy: { title: 'asc' },
      }),
      prisma.movie.count({ where }),
    ]);
    res.json({ items: movies.map(mapMovie), total, ...pageMeta(f, movies.length) });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/admin/movies', async (req, res, next) => {
  try {
    const b = parse(movieBody, req.body);
    const created = await prisma.movie.create({
      data: {
        title: b.title,
        originalTitle: b.originalTitle,
        year: b.year,
        genre: b.genre,
        ageRating: b.ageRating,
        durationMin: b.durationMin,
        director: b.director,
        screenwriter: b.screenwriter,
        cast: b.cast,
        description: b.description,
        posterUrl: b.posterUrl,
        trailerUrl: b.trailerUrl,
        rating: b.rating,
        kpRank: b.kpRank ?? null,
      },
      select: { id: true },
    });
    res.status(201).json(mapMovie(await fetchMovie(created.id)));
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/admin/movies/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const b = parse(moviePatchBody, req.body);
    const cur = await fetchMovie(id);
    await prisma.movie.update({
      where: { id },
      data: {
        title: b.title ?? cur.title,
        originalTitle: b.originalTitle ?? cur.originalTitle,
        year: b.year ?? cur.year,
        genre: b.genre ?? cur.genre,
        ageRating: b.ageRating ?? cur.ageRating,
        durationMin: b.durationMin ?? cur.durationMin,
        director: b.director ?? cur.director,
        screenwriter: b.screenwriter ?? cur.screenwriter,
        cast: b.cast ?? cur.cast,
        description: b.description ?? cur.description,
        posterUrl: b.posterUrl ?? cur.posterUrl,
        trailerUrl: b.trailerUrl ?? cur.trailerUrl,
        rating: b.rating ?? Number(cur.rating),
        kpRank: b.kpRank === undefined ? cur.kpRank : b.kpRank,
      },
    });
    res.json(mapMovie(await fetchMovie(id)));
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/admin/movies/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    await prisma.$transaction(async (tx) => {
      const movie = await tx.movie.findUnique({ where: { id }, select: { id: true } });
      if (!movie) throw notFound('Фильм');
      // Блокируем все сеансы фильма (как при бронировании), чтобы между
      // проверкой и каскадным удалением не появился новый заказ.
      await tx.$queryRaw`SELECT id FROM sessions WHERE movie_id = ${id} ORDER BY id FOR UPDATE`;
      // Каскад удаляет и историю отменённых заказов — запрещаем при любых заказах.
      const anyOrder = await tx.order.findFirst({
        where: { session: { movieId: id } },
        select: { id: true },
      });
      if (anyOrder) {
        throw new ApiError(
          409,
          'Нельзя удалить фильм: по его сеансам есть заказы (включая отменённые). Сначала удалите заказы.',
        );
      }
      await tx.movie.delete({ where: { id } });
    });
    res.json({ id, deleted: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- halls & sessions ---------- */

adminRouter.get('/admin/halls', async (_req, res, next) => {
  try {
    const halls = await prisma.hall.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { seats: true } } },
    });
    res.json({
      items: halls.map((h) => ({
        id: h.id,
        name: h.name,
        rows: h.rows,
        seatsPerRow: h.seatsPerRow,
        seatsCount: h._count.seats,
      })),
    });
  } catch (e) {
    next(e);
  }
});

const toAdminSession = (s: SessionWithRels, soldSeats: number) => ({
  id: s.id,
  startsAt: s.startsAt.toISOString(),
  basePrice: s.basePrice,
  soldSeats,
  hall: { id: s.hall.id, name: s.hall.name, totalSeats: s.hall.rows * s.hall.seatsPerRow },
  movie: { id: s.movie.id, title: s.movie.title, posterUrl: s.movie.posterUrl },
});

const fetchAdminSession = async (id: number) => {
  const s = await prisma.session.findUnique({ where: { id }, include: { movie: true, hall: true } });
  if (!s) throw notFound('Сеанс');
  return toAdminSession(s, await soldSeatsFor(id));
};

adminRouter.get('/admin/sessions', async (req, res, next) => {
  try {
    const f = parse(adminListQuery, req.query);
    const where: Prisma.SessionWhereInput = {};
    if (f.q) {
      where.OR = [
        { movie: { title: { contains: f.q, mode: 'insensitive' } } },
        { hall: { name: { contains: f.q, mode: 'insensitive' } } },
      ];
    }
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        ...skipTake(f),
        include: { movie: true, hall: true },
        orderBy: { startsAt: 'desc' },
      }),
      prisma.session.count({ where }),
    ]);
    const sold = await soldSeatsMap(sessions.map((s) => s.id));
    res.json({
      items: sessions.map((s) => toAdminSession(s, sold.get(s.id) ?? 0)),
      total,
      ...pageMeta(f, sessions.length),
    });
  } catch (e) {
    next(e);
  }
});

adminRouter.post('/admin/sessions', async (req, res, next) => {
  try {
    const b = parse(sessionBody, req.body);
    const movie = await prisma.movie.findUnique({
      where: { id: b.movieId },
      select: { id: true, durationMin: true },
    });
    if (!movie) throw notFound('Фильм');
    const hall = await prisma.hall.findUnique({ where: { id: b.hallId }, select: { id: true } });
    if (!hall) throw notFound('Зал');
    const clash = await findHallConflict(b.hallId, new Date(b.startsAt), movie.durationMin);
    if (clash) {
      throw new ApiError(409, `Зал занят: в это время там идёт «${clash.movieTitle}» (сеанс №${clash.id})`);
    }
    const created = await prisma.session.create({
      data: { movieId: b.movieId, hallId: b.hallId, startsAt: b.startsAt, basePrice: b.basePrice },
      select: { id: true },
    });
    res.status(201).json(await fetchAdminSession(created.id));
  } catch (e) {
    next(e);
  }
});

adminRouter.patch('/admin/sessions/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    const b = parse(sessionPatchBody, req.body);
    const cur = await prisma.session.findUnique({ where: { id } });
    if (!cur) throw notFound('Сеанс');

    const movieId = b.movieId ?? cur.movieId;
    const hallId = b.hallId ?? cur.hallId;
    if (
      b.movieId !== undefined &&
      !(await prisma.movie.findUnique({ where: { id: movieId }, select: { id: true } }))
    ) {
      throw notFound('Фильм');
    }
    if (
      b.hallId !== undefined &&
      !(await prisma.hall.findUnique({ where: { id: hallId }, select: { id: true } }))
    ) {
      throw notFound('Зал');
    }
    const duration = (await prisma.movie.findUnique({
      where: { id: movieId },
      select: { durationMin: true },
    }))!.durationMin;
    const clash = await findHallConflict(hallId, b.startsAt ?? cur.startsAt, duration, id);
    if (clash) {
      throw new ApiError(409, `Зал занят: в это время там идёт «${clash.movieTitle}» (сеанс №${clash.id})`);
    }

    const changesSeatBinding = movieId !== cur.movieId || hallId !== cur.hallId;
    await prisma.$transaction(async (tx) => {
      // Та же блокировка, что при бронировании: заказ не может проскочить
      // между проверкой проданных мест и сменой зала/фильма.
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM sessions WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw notFound('Сеанс');
      if (changesSeatBinding) {
        const active = await tx.order.findFirst({
          where: { sessionId: id, status: { in: ['new', 'confirmed'] } },
          select: { id: true },
        });
        if (active) {
          throw new ApiError(
            409,
            'Нельзя менять зал или фильм сеанса: по нему есть активные заказы. Сначала отмените или удалите их.',
          );
        }
      }
      await tx.session.update({
        where: { id },
        data: {
          movieId,
          hallId,
          startsAt: b.startsAt ?? cur.startsAt,
          basePrice: b.basePrice ?? cur.basePrice,
        },
      });
    });
    res.json(await fetchAdminSession(id));
  } catch (e) {
    next(e);
  }
});

adminRouter.delete('/admin/sessions/:id', async (req, res, next) => {
  try {
    const id = parse(idParam, req.params.id);
    await prisma.$transaction(async (tx) => {
      // Блокировка строки сеанса (как при бронировании): между проверкой
      // и удалением не может появиться новый заказ.
      const locked = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM sessions WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw notFound('Сеанс');
      // Каскад удаляет и историю отменённых заказов, поэтому запрещаем
      // удаление при любых заказах — историю нельзя терять молча.
      const anyOrder = await tx.order.findFirst({ where: { sessionId: id }, select: { id: true } });
      if (anyOrder) {
        throw new ApiError(
          409,
          'Нельзя удалить сеанс: по нему есть заказы (включая отменённые). Сначала удалите заказы.',
        );
      }
      await tx.session.delete({ where: { id } });
    });
    res.json({ id, deleted: true });
  } catch (e) {
    next(e);
  }
});
