import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../../lib/api';
import { useDebounced, useFetch } from '../../lib/hooks';
import { fmtDateTime, fmtPrice, plural } from '../../lib/format';
import type { AdminOrder, OrderStatus } from '../../types';
import { ErrorBox } from '../../components/ErrorBox';
import { Loader } from '../../components/Loader';
import { Pager } from '../../components/Pager';
import type { ToastFn } from '../../lib/toast';

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  cancelled: 'Отменён',
};

const STATUS_TABS: { value: '' | OrderStatus; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'confirmed', label: 'Подтверждённые' },
  { value: 'cancelled', label: 'Отменённые' },
];

export function OrdersSection({
  token,
  toast,
  onStatsChange,
}: {
  token: string;
  toast: ToastFn;
  onStatsChange: () => void;
}) {
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput, 350);
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Новый поиск или фильтр статуса — с первой страницы.
  useEffect(() => setPage(1), [q, status]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    p.set('page', String(page));
    p.set('pageSize', '20');
    return p.toString();
  }, [q, status, page]);

  const list = useFetch<{ items: AdminOrder[]; total: number; page: number; pageSize: number }>(
    () => api(`/admin/orders?${query}`, { token }),
    [query, token],
  );

  useEffect(() => {
    if (list.data) setOrders(list.data.items);
  }, [list.data]);

  // После удаления последней записи на странице возвращаемся на предыдущую.
  useEffect(() => {
    if (list.data && list.data.items.length === 0 && list.data.total > 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(list.data.total / list.data.pageSize)));
    }
  }, [list.data, page]);

  const changeStatus = async (order: AdminOrder, next: OrderStatus) => {
    setBusyId(order.id);
    const prevStatus = order.status;
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    try {
      await api(`/admin/orders/${order.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: next }),
      });
      toast('success', `Заказ ${order.code}: ${STATUS_LABEL[next].toLowerCase()}`);
      onStatsChange();
    } catch (e) {
      // Откатываем только этот заказ: параллельные изменения других строк не теряются.
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, status: prevStatus } : o)));
      toast('error', e instanceof ApiClientError ? e.message : 'Не удалось изменить статус');
    } finally {
      setBusyId(null);
    }
  };

  const removeOrder = async (order: AdminOrder) => {
    setBusyId(order.id);
    const index = orders.findIndex((o) => o.id === order.id);
    setOrders((os) => os.filter((o) => o.id !== order.id));
    setConfirmDelete(null);
    try {
      await api(`/admin/orders/${order.id}`, { method: 'DELETE', token });
      toast('success', `Заказ ${order.code} удалён`);
      onStatsChange();
      list.retry();
    } catch (e) {
      // Возвращаем заказ на прежнее место, не затирая изменения других строк.
      setOrders((os) => {
        const next = [...os];
        next.splice(Math.max(0, Math.min(index, next.length)), 0, order);
        return next;
      });
      toast('error', e instanceof ApiClientError ? e.message : 'Не удалось удалить заказ');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="admin-toolbar">
        <div className="search-wrap">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" />
          </svg>
          <input
            className="input"
            type="search"
            placeholder="Поиск: код, имя, e-mail, телефон, фильм…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            aria-label="Поиск заказов"
          />
        </div>
        <div className="status-tabs" role="tablist">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              className={`status-tab ${status === t.value ? 'active' : ''}`}
              onClick={() => setStatus(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {list.loading && orders.length === 0 ? (
        <Loader label="Загружаем заказы…" />
      ) : list.error && orders.length === 0 ? (
        <ErrorBox error={list.error} onRetry={list.retry} />
      ) : orders.length === 0 ? (
        <div className="state-box">
          <h3>Заказов нет</h3>
          <p>По заданным условиям ничего не найдено. Оформите заказ на афише — он появится здесь.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table orders">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Покупатель</th>
                  <th>Сеанс</th>
                  <th>Места</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Создан</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    expanded={expanded === o.id}
                    onExpand={() => setExpanded(expanded === o.id ? null : o.id)}
                    busy={busyId === o.id}
                    confirmDelete={confirmDelete === o.id}
                    onAskDelete={() => setConfirmDelete(o.id)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onStatus={(s) => changeStatus(o, s)}
                    onDelete={() => removeOrder(o)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pager
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onPage={setPage}
            />
          )}
        </>
      )}
    </>
  );
}

function OrderRow({
  order: o,
  expanded,
  onExpand,
  busy,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onStatus,
  onDelete,
}: {
  order: AdminOrder;
  expanded: boolean;
  onExpand: () => void;
  busy: boolean;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onStatus: (s: OrderStatus) => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr className={expanded ? 'expanded' : ''}>
        <td>
          <span className="order-code">{o.code}</span>{' '}
          {o.isDemo && (
            <span
              className="badge badge-hall"
              title="Демо-заказ: создан генератором витрины, в статистике не учитывается"
            >
              демо
            </span>
          )}
        </td>
        <td className="order-customer">
          <b>{o.customer.name}</b>
          <span>{o.customer.email}</span>
        </td>
        <td>
          <div className="order-movie">
            <img src={o.session.posterUrl} alt="" loading="lazy" />
            <div>
              <b>{o.session.movieTitle}</b>
              <span>
                {fmtDateTime(o.session.startsAt)} · {o.session.hallName}
              </span>
            </div>
          </div>
        </td>
        <td>
          {o.seats.length} {plural(o.seats.length, 'место', 'места', 'мест')}
        </td>
        <td>
          <span className="order-total">{fmtPrice(o.total)}</span>
        </td>
        <td>
          <span className={`status-pill status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
        </td>
        <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{fmtDateTime(o.createdAt)}</td>
        <td>
          <div className="row-actions">
            <button
              className="icon-btn"
              title={expanded ? 'Свернуть' : 'Подробности'}
              aria-label={expanded ? 'Свернуть' : 'Подробности'}
              aria-expanded={expanded}
              onClick={onExpand}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={expanded ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
              </svg>
            </button>
            {o.status !== 'confirmed' && (
              <button
                className="icon-btn ok"
                title="Подтвердить заказ"
                aria-label="Подтвердить заказ"
                disabled={busy}
                onClick={() => onStatus('confirmed')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </button>
            )}
            {o.status !== 'cancelled' && (
              <button
                className="icon-btn no"
                title="Отменить заказ"
                aria-label="Отменить заказ"
                disabled={busy}
                onClick={() => onStatus('cancelled')}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
            {confirmDelete ? (
              <>
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={onDelete}>
                  Удалить?
                </button>
                <button className="btn btn-ghost btn-sm" onClick={onCancelDelete}>
                  Нет
                </button>
              </>
            ) : (
              <button
                className="icon-btn no"
                title="Удалить заказ"
                aria-label="Удалить заказ"
                disabled={busy}
                onClick={onAskDelete}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
                </svg>
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="expand-row">
          <td colSpan={8}>
            <div className="expand-grid">
              <div>
                <h4>Контакты</h4>
                <div>{o.customer.name}</div>
                <div style={{ color: 'var(--text-dim)' }}>
                  {o.customer.email} · {o.customer.phone}
                </div>
              </div>
              <div>
                <h4>Места и цены</h4>
                <div className="seat-tags">
                  {o.seats.map((s) => (
                    <span key={s.seatId} className={`seat-tag ${s.tier}`}>
                      ряд {s.row} · место {s.number} · {fmtPrice(s.price)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h4>Сеанс</h4>
                <Link to={`/sessions/${o.session.id}`}>
                  {o.session.movieTitle} · {fmtDateTime(o.session.startsAt)}
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
