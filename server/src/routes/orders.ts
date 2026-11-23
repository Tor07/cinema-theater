import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ApiError, badRequest, isSeatUniqueViolation, notFound } from '../errors.js';
import { orderBody, parse } from '../validation.js';
import { seatPrice } from '../pricing.js';

export const ordersRouter = Router();

ordersRouter.post('/orders', async (req, res, next) => {
  try {
    const body = parse(orderBody, req.body);

    const result = await prisma.$transaction(async (tx) => {
      // Блокируем строку сеанса, чтобы сериализовать параллельные бронирования.
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${body.sessionId} FOR UPDATE`;

      const session = await tx.session.findUnique({
        where: { id: body.sessionId },
        include: { movie: { select: { title: true } } },
      });
      if (!session) throw notFound('Сеанс');
      if (session.startsAt.getTime() <= Date.now()) {
        throw badRequest('Продажа билетов закрыта: сеанс уже начался — выберите другой');
      }

      const seats = await tx.seat.findMany({
        where: { hallId: session.hallId, id: { in: body.seatIds } },
        orderBy: [{ row: 'asc' }, { number: 'asc' }],
      });
      if (seats.length !== body.seatIds.length) {
        throw badRequest('Некоторые места не принадлежат залу этого сеанса');
      }

      const taken = await tx.orderItem.findMany({
        where: {
          sessionId: body.sessionId,
          seatId: { in: body.seatIds },
          order: { status: { not: 'cancelled' } },
        },
        select: { seatId: true },
      });
      if (taken.length > 0) {
        throw new ApiError(409, 'Выбранные места уже заняты — обновите карту зала', {
          seatIds: taken.map((t) => t.seatId),
        });
      }

      const items = seats.map((seat) => ({
        seatId: seat.id,
        row: seat.row,
        number: seat.number,
        tier: seat.tier,
        price: seatPrice(session.basePrice, seat.tier),
      }));
      const total = items.reduce((sum, i) => sum + i.price, 0);
      const code = 'AV-' + randomBytes(4).toString('hex').toUpperCase();

      const order = await tx.order.create({
        data: {
          code,
          sessionId: body.sessionId,
          customerName: body.customer.name,
          email: body.customer.email,
          phone: body.customer.phone,
          total,
          items: {
            create: items.map((i) => ({ sessionId: body.sessionId, ...i })),
          },
        },
        select: { id: true, code: true, createdAt: true },
      });

      return { order, startsAt: session.startsAt, movieTitle: session.movie.title, items, total };
    });

    res.status(201).json({
      id: result.order.id,
      code: result.order.code,
      sessionId: body.sessionId,
      movieTitle: result.movieTitle,
      startsAt: result.startsAt.toISOString(),
      customer: body.customer,
      seats: result.items.map((i) => ({
        seatId: i.seatId,
        row: i.row,
        number: i.number,
        tier: i.tier,
        price: i.price,
      })),
      total: result.total,
      status: 'new',
      createdAt: result.order.createdAt.toISOString(),
    });
  } catch (e) {
    // Страховочный индекс БД поймал гонку, которую пропустила проверка выше.
    if (isSeatUniqueViolation(e)) {
      next(new ApiError(409, 'Выбранные места уже заняты — обновите карту зала'));
      return;
    }
    next(e);
  }
});
