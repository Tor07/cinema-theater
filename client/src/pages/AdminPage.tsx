import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, clearToken, getToken } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { fmtPrice } from '../lib/format';
import type { AdminStats } from '../types';
import type { ToastFn } from '../lib/toast';
import { ErrorBox } from '../components/ErrorBox';
import { Loader } from '../components/Loader';
import { OrdersSection } from './admin/OrdersSection';
import { SessionsSection } from './admin/SessionsSection';
import { MoviesSection } from './admin/MoviesSection';

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}

type Section = 'orders' | 'sessions' | 'movies';

const SECTIONS: { value: Section; label: string; hint: string }[] = [
  { value: 'orders', label: 'Заказы', hint: 'статусы, отмена и удаление заказов' },
  { value: 'sessions', label: 'Сеансы', hint: 'расписание, залы и цены' },
  { value: 'movies', label: 'Фильмы', hint: 'каталог, описания и постеры' },
];

export function AdminPage() {
  const navigate = useNavigate();
  const token = getToken();
  const [meError, setMeError] = useState(false);

  const me = useFetch<{ login: string }>(() => api('/auth/me', { token: token ?? '' }), [token]);

  useEffect(() => {
    if (me.error?.status === 401) {
      clearToken();
      setMeError(true);
    }
  }, [me.error]);

  if (!token || meError) return <Navigate to="/login" replace />;
  if (me.loading)
    return (
      <div className="container" style={{ paddingTop: 80 }}>
        <Loader label="Проверяем доступ…" />
      </div>
    );
  if (me.error)
    return (
      <div className="container" style={{ paddingTop: 80 }}>
        <ErrorBox error={me.error} onRetry={me.retry} />
      </div>
    );

  return (
    <AdminDashboard
      login={me.data!.login}
      token={token}
      onLogout={() => {
        clearToken();
        navigate('/login');
      }}
    />
  );
}

function AdminDashboard({ login, token, onLogout }: { login: string; token: string; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('orders');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const stats = useFetch<AdminStats>(() => api('/admin/stats', { token }), [token]);

  const toast: ToastFn = (kind, text) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  };

  return (
    <div className="container">
      <header className="admin-head">
        <div>
          <h1>Панель администратора</h1>
          <span className="who">
            Вы вошли как <b>{login}</b> · записи пользователей обновляются в реальном времени
          </span>
        </div>
        <div className="admin-actions">
          <Link to="/" className="btn btn-ghost btn-sm">
            К афише
          </Link>
          <button className="btn btn-danger btn-sm" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      {stats.loading && !stats.data ? (
        <Loader label="Считаем выручку…" />
      ) : stats.error ? (
        <ErrorBox error={stats.error} onRetry={stats.retry} />
      ) : (
        stats.data && (
          <div className="stats-grid">
            <div className="stat-card">
              <b>{stats.data.orders_total}</b>
              <span>всего заказов</span>
            </div>
            <div className="stat-card">
              <b>{fmtPrice(stats.data.revenue)}</b>
              <span>выручка</span>
            </div>
            <div className="stat-card">
              <b>{stats.data.ticketsSold}</b>
              <span>билетов продано</span>
            </div>
            <div className="stat-card">
              <b>{stats.data.orders_new}</b>
              <span>новых заказов</span>
            </div>
            <div className="stat-card">
              <b>{fmtPrice(stats.data.revenue_today)}</b>
              <span>выручка сегодня</span>
            </div>
          </div>
        )
      )}

      <p className="booking-hint">
        Статистика считается только по реальным заказам. Демо-заказы генератора витрины помечены значком
        «демо» в списке и в неё не входят.
      </p>

      <nav className="section-tabs" role="tablist" aria-label="Разделы панели">
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            role="tab"
            aria-selected={section === s.value}
            className={`section-tab ${section === s.value ? 'active' : ''}`}
            onClick={() => setSection(s.value)}
          >
            {s.label}
            <small>{s.hint}</small>
          </button>
        ))}
      </nav>

      {section === 'orders' && <OrdersSection token={token} toast={toast} onStatsChange={stats.retry} />}
      {section === 'sessions' && <SessionsSection token={token} toast={toast} />}
      {section === 'movies' && <MoviesSection token={token} toast={toast} />}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
