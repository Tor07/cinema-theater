export const fmtPrice = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const fmtWeekday = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { weekday: 'short' });

export const fmtDuration = (min: number) => `${Math.floor(min / 60)} ч ${min % 60} мин`;

export function dateLabel(dateStr: string): string {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dateStr === key(today)) return 'Сегодня';
  if (dateStr === key(tomorrow)) return 'Завтра';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export const ageLabel = (age: number) => `${age}+`;

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateTimeLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromDateTimeLocal = (value: string) => new Date(value).toISOString();

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
