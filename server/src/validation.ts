import { z } from 'zod';
import { badRequest } from './errors.js';
import { paginationShape } from './pagination.js';

export const seatTier = z.enum(['standard', 'comfort', 'vip']);

export const sessionsQuery = z.object({
  q: z.string().trim().max(120).optional(),
  genre: z.string().trim().max(60).optional(),
  ageRating: z.coerce.number().int().min(0).max(21).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается дата в формате ГГГГ-ММ-ДД')
    .optional(),
  movieId: z.coerce.number().int().positive().optional(),
  top: z.enum(['1']).optional(),
  ...paginationShape,
});

export const idParam = z.coerce.number().int().positive();

export const orderBody = z.object({
  sessionId: z.number().int().positive(),
  seatIds: z
    .array(z.number().int().positive())
    .min(1, 'Выберите хотя бы одно место')
    .max(8, 'Не более 8 мест в одном заказе')
    .refine((a) => new Set(a).size === a.length, 'Места не должны повторяться'),
  customer: z.object({
    name: z.string().trim().min(2, 'Укажите имя (минимум 2 символа)').max(80),
    email: z.string().trim().email('Некорректный e-mail').max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Некорректный номер телефона'),
  }),
});

export const loginBody = z.object({
  login: z.string().trim().min(1, 'Введите логин').max(60),
  password: z.string().min(1, 'Введите пароль').max(120),
});

export const adminOrdersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['new', 'confirmed', 'cancelled']).optional(),
  ...paginationShape,
});

export const orderStatusBody = z.object({
  status: z.enum(['new', 'confirmed', 'cancelled']),
});

export const adminListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  ...paginationShape,
});

export const movieBody = z.object({
  title: z.string().trim().min(2, 'Укажите название').max(120),
  originalTitle: z.string().trim().max(120),
  year: z.coerce
    .number()
    .int()
    .min(1880, 'Год выглядит неправдоподобно')
    .max(2100, 'Год выглядит неправдоподобно'),
  genre: z.string().trim().min(2, 'Укажите жанр').max(60),
  ageRating: z.coerce
    .number()
    .int()
    .refine((v) => [0, 6, 12, 16, 18].includes(v), 'Возрастной рейтинг: 0, 6, 12, 16 или 18'),
  durationMin: z.coerce
    .number()
    .int()
    .min(1, 'Укажите длительность')
    .max(600, 'Слишком большая длительность'),
  director: z.string().trim().max(120),
  screenwriter: z.string().trim().max(160),
  cast: z
    .array(z.string().trim().min(2, 'Имя актёра слишком короткое').max(80))
    .max(20, 'Не более 20 актёров'),
  description: z.string().trim().min(10, 'Описание слишком короткое').max(2000, 'Описание слишком длинное'),
  posterUrl: z.string().trim().min(1, 'Укажите путь к постеру').max(300),
  trailerUrl: z.string().trim().max(300),
  rating: z.coerce.number().min(0, 'Рейтинг от 0 до 10').max(10, 'Рейтинг от 0 до 10'),
  kpRank: z.coerce.number().int().positive('Номер в топе — целое положительное').nullable().optional(),
});
export const moviePatchBody = movieBody.partial();

export const sessionBody = z.object({
  movieId: z.coerce.number().int().positive('Выберите фильм'),
  hallId: z.coerce.number().int().positive('Выберите зал'),
  startsAt: z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Некорректные дата и время'),
  basePrice: z.coerce.number().int().min(50, 'Минимальная цена — 50 ₽').max(100000, 'Слишком высокая цена'),
});
export const sessionPatchBody = sessionBody.partial();

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(
      'Ошибка валидации входных данных',
      r.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    );
  }
  return r.data;
}
