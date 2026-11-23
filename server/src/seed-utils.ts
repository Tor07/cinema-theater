// Общие утилиты сидов: детерминированный ГСЧ, тип места и данные демо-витрины.
// Данные лежат отдельно от кода: src/data/movies.json (единый каталог, включая
// топ-10 Кинопоиска) и src/data/customers.json (демо-покупатели).

import moviesJson from './data/movies.json' with { type: 'json' };
import customersJson from './data/customers.json' with { type: 'json' };

/** Детерминированный ГСЧ (mulberry32): одинаковый seed → одинаковая демо-витрина. */
export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeatLite = { id: number; tier: string; row: number; number: number };

/** Запись каталога (поля совпадают с моделью Movie). */
export interface MovieData {
  title: string;
  originalTitle: string;
  year: number;
  genre: string;
  ageRating: number;
  durationMin: number;
  director: string;
  screenwriter: string;
  cast: string[];
  description: string;
  posterUrl: string;
  trailerUrl: string;
  rating: number;
  /** Место в топе Кинопоиска; null — фильм вне топа. */
  kpRank: number | null;
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

/** Единый каталог: базовая афиша + топ-10 Кинопоиска, без дублей по названиям. */
export const MOVIES: MovieData[] = moviesJson;

/** Топ-10 по версии Кинопоиска (kinopoisk.ru/lists/movies/top250/) — записи того же каталога. */
export const TOP10: MovieData[] = MOVIES.filter((m) => m.kpRank !== null).sort(
  (a, b) => (a.kpRank ?? 0) - (b.kpRank ?? 0),
);

/** Демо-покупатели для заказов генератора витрины (isDemo). */
export const CUSTOMERS: Customer[] = customersJson;
