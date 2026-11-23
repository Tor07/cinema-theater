import { z } from 'zod';

// Пагинация опциональна: без page/pageSize список отдаётся целиком (обратная
// совместимость — например, выпадающие списки в админке), с ними — страница
// через skip/take, а total = полное число записей под фильтром.
export const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
};

export interface Pagination {
  page?: number;
  pageSize?: number;
}

// Единый тип с опциональными полями (не union) — иначе spread ломает
// инференс аргументов Prisma findMany.
export const skipTake = (p: Pagination): { skip?: number; take?: number } =>
  p.pageSize === undefined ? {} : { skip: ((p.page ?? 1) - 1) * p.pageSize, take: p.pageSize };

// pageSize в ответе — фактический размер страницы (без пагинации = весь список).
export const pageMeta = (p: Pagination, returned: number) => ({
  page: p.page ?? 1,
  pageSize: p.pageSize ?? returned,
});
