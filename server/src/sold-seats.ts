import { prisma } from './prisma.js';

/** Количество проданных мест по каждому сеансу (заказы, кроме отменённых). */
export async function soldSeatsMap(sessionIds: number[]): Promise<Map<number, number>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await prisma.orderItem.groupBy({
    by: ['sessionId'],
    where: { sessionId: { in: sessionIds }, order: { status: { not: 'cancelled' } } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.sessionId, r._count._all]));
}

/** Количество проданных мест одного сеанса (заказы, кроме отменённых). */
export function soldSeatsFor(sessionId: number): Promise<number> {
  return prisma.orderItem.count({
    where: { sessionId, order: { status: { not: 'cancelled' } } },
  });
}
