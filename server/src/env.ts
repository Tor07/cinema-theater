import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Ни tsx, ни Node не загружают .env сами. Читаем его до первого обращения
// к process.env; уже заданные переменные окружения имеют приоритет
// (поведение как у node --env-file). Путь считается от файла, а не от cwd.
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

/**
 * Демо-режим: автофилл создаёт демо-заказы (isDemo) для автосгенерированных сеансов,
 * чтобы витрина выглядела живой. Включён по умолчанию; выключается DEMO_MODE=0
 * (или false/no/off). На расписание сеансов флаг не влияет — оно заполняется всегда.
 */
export const DEMO_MODE = !['0', 'false', 'no', 'off'].includes(
  (process.env.DEMO_MODE ?? '').trim().toLowerCase(),
);

/**
 * Учётка администратора для первого сида: ADMIN_LOGIN / ADMIN_PASSWORD.
 * Дефолт admin/admin123 публично известен, поэтому допустим только в демо-режиме.
 * При DEMO_MODE=0 свой пароль обязателен — без него падаем при старте (как с JWT_SECRET).
 */
export const ADMIN_LOGIN = (process.env.ADMIN_LOGIN ?? '').trim() || 'admin';

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword && !DEMO_MODE) {
  throw new Error('ADMIN_PASSWORD не задан: при DEMO_MODE=0 укажите пароль администратора в server/.env.');
}
export const ADMIN_PASSWORD = adminPassword || 'admin123';
