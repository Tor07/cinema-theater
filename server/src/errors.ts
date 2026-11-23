import { Prisma } from '@prisma/client';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, `${what} не найден`);
export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, details);
export const unauthorized = (message = 'Требуется авторизация') => new ApiError(401, message);

/** Сработал частичный уникальный индекс активного места (uq_order_items_active_seat). */
export function isSeatUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const target = (e.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('seat');
}
