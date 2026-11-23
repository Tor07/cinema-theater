import './env.js';
import { prisma } from './prisma.js';

/**
 * Страховка от двойной продажи места на уровне БД: частичный уникальный индекс
 * (session_id, seat_id) только по активным (не отменённым) заказам.
 *
 * Prisma не умеет выражать WHERE в @@unique, поэтому индекс создаётся сырым SQL.
 * `prisma db push` может удалять индексы, которых нет в схеме, — поэтому индекс
 * пересоздаётся при каждом старте сервера (IF NOT EXISTS — идемпотентно).
 */
export async function ensureDbIndexes(): Promise<void> {
  // Признак active зеркалит orders.status <> 'cancelled'.
  // Самолечение существующих строк: db push заполняет колонку дефолтом true.
  await prisma.$executeRaw`
    UPDATE order_items oi SET active = false
    FROM orders o
    WHERE oi.order_id = o.id AND o.status = 'cancelled' AND oi.active = true`;
  await prisma.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_active_seat
    ON order_items (session_id, seat_id) WHERE active`;
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('db-indexes.ts');
if (isMain) {
  ensureDbIndexes()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
