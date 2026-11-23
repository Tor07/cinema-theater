import { prisma } from './prisma.js';

export type Rnd = () => number;

// Технологический перерыв между сеансами в одном зале (уборка, посадка).
export const CLEANUP_MIN = 20;

// Ключ advisory-блокировки Postgres для сида/автофилла: параллельные запуски
// (например, два dev-сервера при рестарте) сериализуются и не плодят дубли.
export const DB_FILL_LOCK = 4001;
const OPEN_MIN = 10 * 60;
const LAST_START_MIN = 22 * 60;
const DAY_END_MIN = 24 * 60;
const STEP_MIN = 10;

// Соглашение о времени во всём проекте: календарные сутки — локальные сутки сервера
// (часовой пояс кинотеатра), моменты времени хранятся и передаются как UTC-инстанты.
export const dayStart = (offset: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Ключ локального календарного дня «ГГГГ-ММ-ДД».
 * Единый формат для /filters и фильтра ?date: считается в локальных сутках сервера,
 * как и планировщик расписания, чтобы ключи совпадали с тем, что видит клиент.
 */
export const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Локальная полночь для ключа дня «ГГГГ-ММ-ДД» (обратная к toDateKey). */
export const dateKeyToDay = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Локальная полночь следующего дня (DST-безопасно, не через +24ч). */
export const nextDayStart = (day: Date): Date => {
  const n = new Date(day);
  n.setDate(n.getDate() + 1);
  n.setHours(0, 0, 0, 0);
  return n;
};

const dayIndexOf = (d: Date): number => {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((local - dayStart(0).getTime()) / 86_400_000);
};

const minutesOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/**
 * Планировщик расписания: гарантирует, что в одном зале сеансы не пересекаются
 * (с учётом перерыва), а значит одновременно идёт не больше сеансов, чем залов.
 */
export class SchedulePlanner {
  private readonly busy = new Map<string, [number, number][]>();

  constructor(
    private readonly hallIds: number[],
    readonly dayCount: number,
  ) {}

  static async load(hallIds: number[], dayCount: number): Promise<SchedulePlanner> {
    const planner = new SchedulePlanner(hallIds, dayCount);
    const rows = await prisma.session.findMany({
      where: { startsAt: { gte: dayStart(0), lt: dayStart(dayCount) } },
      select: { hallId: true, startsAt: true, movie: { select: { durationMin: true } } },
    });
    for (const r of rows) planner.reserve(r.hallId, r.startsAt, r.movie.durationMin);
    return planner;
  }

  reserve(hallId: number, startsAt: Date, durationMin: number) {
    const day = dayIndexOf(startsAt);
    if (day < 0 || day >= this.dayCount) return;
    const start = minutesOfDay(startsAt);
    this.occupy(hallId, day, start, durationMin);
  }

  place(durationMin: number, day: number, rnd: Rnd): { hallId: number; startsAt: Date } | null {
    const candidates: { hallId: number; start: number }[] = [];
    for (const hallId of this.hallIds) {
      for (let start = OPEN_MIN; start <= LAST_START_MIN; start += STEP_MIN) {
        if (start + durationMin > DAY_END_MIN) break;
        if (this.isFree(hallId, day, start, durationMin)) candidates.push({ hallId, start });
      }
    }
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(rnd() * candidates.length)];
    this.occupy(pick.hallId, day, pick.start, durationMin);
    const startsAt = dayStart(day);
    startsAt.setMinutes(pick.start);
    return { hallId: pick.hallId, startsAt };
  }

  private occupy(hallId: number, day: number, start: number, durationMin: number) {
    const key = `${hallId}:${day}`;
    const list = this.busy.get(key) ?? [];
    list.push([start - CLEANUP_MIN, start + durationMin + CLEANUP_MIN]);
    this.busy.set(key, list);
  }

  private isFree(hallId: number, day: number, start: number, durationMin: number): boolean {
    const from = start - CLEANUP_MIN;
    const to = start + durationMin + CLEANUP_MIN;
    for (const [bFrom, bTo] of this.busy.get(`${hallId}:${day}`) ?? []) {
      if (bFrom < to && bTo > from) return false;
    }
    return true;
  }
}

/** Пересечение нового сеанса с уже существующими в том же зале (с учётом перерыва). */
export async function findHallConflict(
  hallId: number,
  startsAt: Date,
  durationMin: number,
  excludeSessionId?: number,
): Promise<{ id: number; startsAt: Date; movieTitle: string } | null> {
  const start = startsAt.getTime();
  const end = start + durationMin * 60_000;
  const margin = CLEANUP_MIN * 60_000;
  // Нижняя граница окна: пересечение возможно, только если rStart > start - margin - rDuration.
  // Максимальная длительность в каталоге даёт точную границу — далёкие прошлые
  // сеансы не сканируем (раньше запрос тянул всю историю зала).
  const longest = await prisma.movie.aggregate({ _max: { durationMin: true } });
  const maxDurationMs = (longest._max.durationMin ?? 0) * 60_000;
  const rows = await prisma.session.findMany({
    where: {
      hallId,
      id: excludeSessionId === undefined ? undefined : { not: excludeSessionId },
      startsAt: { gte: new Date(start - margin - maxDurationMs), lt: new Date(end + margin) },
    },
    include: { movie: { select: { title: true, durationMin: true } } },
  });
  for (const r of rows) {
    const rStart = r.startsAt.getTime();
    const rEnd = rStart + r.movie.durationMin * 60_000;
    if (rStart - margin < end && rEnd + margin > start) {
      return { id: r.id, startsAt: r.startsAt, movieTitle: r.movie.title };
    }
  }
  return null;
}
