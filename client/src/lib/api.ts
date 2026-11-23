import axios, { AxiosError, type AxiosRequestConfig, type Method } from 'axios';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

interface ApiErrorBody {
  error?: string;
  details?: { field: string; message: string }[];
}

// Единый axios-инстанс для всех запросов между клиентом и сервером.
export const http = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
  timeout: 15_000,
});

export async function api<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body != null) headers['Content-Type'] = 'application/json';
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`;

  const config: AxiosRequestConfig = {
    url: path,
    method: (init?.method ?? 'GET') as Method,
    headers,
  };
  if (init?.body != null) config.data = init.body;

  try {
    const res = await http.request<T>(config);
    return res.data;
  } catch (e) {
    const err = e as AxiosError<ApiErrorBody>;
    if (!err.response) {
      const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      throw new ApiClientError(
        0,
        timedOut
          ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
          : 'Сервер недоступен. Проверьте, что API запущен.',
      );
    }
    throw new ApiClientError(
      err.response.status,
      err.response.data?.error ?? `Ошибка запроса (${err.response.status})`,
      err.response.data?.details,
    );
  }
}

export const TOKEN_COOKIE = 'aurora_token';

export function getToken(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${TOKEN_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setToken(token: string, maxAgeSec: number) {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
}

export function clearToken() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
