import { useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '../../lib/api';
import { useDebounced, useFetch } from '../../lib/hooks';
import { fmtDateTime, fmtPrice, fromDateTimeLocal, plural, toDateTimeLocal } from '../../lib/format';
import type { AdminSession, Hall, MovieShort } from '../../types';
import { ErrorBox } from '../../components/ErrorBox';
import { Loader } from '../../components/Loader';
import { Pager } from '../../components/Pager';
import { Modal } from './Modal';
import type { ToastFn } from '../../lib/toast';

interface SessionForm {
  movieId: string;
  hallId: string;
  startsAt: string;
  basePrice: string;
}

const emptyForm = (): SessionForm => ({ movieId: '', hallId: '', startsAt: '', basePrice: '350' });

export function SessionsSection({ token, toast }: { token: string; toast: ToastFn }) {
  const [qInput, setQInput] = useState('');
  const q = useDebounced(qInput, 350);
  const [page, setPage] = useState(1);

  // Новый поиск — с первой страницы.
  useEffect(() => setPage(1), [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    p.set('page', String(page));
    p.set('pageSize', '20');
    return p.toString();
  }, [q, page]);

  const list = useFetch<{ items: AdminSession[]; total: number; page: number; pageSize: number }>(
    () => api(`/admin/sessions?${query}`, { token }),
    [query, token],
  );
  // Выпадающие списки формы: без page/pageSize сервер отдаёт весь каталог.
  const movies = useFetch<{ items: MovieShort[] }>(() => api('/admin/movies', { token }), [token]);
  const halls = useFetch<{ items: Hall[] }>(() => api('/admin/halls', { token }), [token]);

  // После удаления последней записи на странице возвращаемся на предыдущую.
  useEffect(() => {
    if (list.data && list.data.items.length === 0 && list.data.total > 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(list.data.total / list.data.pageSize)));
    }
  }, [list.data, page]);

  const [editing, setEditing] = useState<AdminSession | 'new' | null>(null);
  const [form, setForm] = useState<SessionForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Проданные билеты привязаны к местам текущего зала: сервер запрещает
  // менять зал/фильм такого сеанса (409), поэтому блокируем выбор и в форме.
  const bindingLocked = editing !== null && editing !== 'new' && editing.soldSeats > 0;

  const open = (target: AdminSession | 'new') => {
    setFormError(null);
    setForm(
      target === 'new'
        ? emptyForm()
        : {
            movieId: String(target.movie.id),
            hallId: String(target.hall.id),
            startsAt: toDateTimeLocal(target.startsAt),
            basePrice: String(target.basePrice),
          },
    );
    setEditing(target);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.movieId || !form.hallId || !form.startsAt) {
      setFormError('Заполните фильм, зал и время начала');
      return;
    }
    setBusy(true);
    setFormError(null);
    const body = {
      movieId: Number(form.movieId),
      hallId: Number(form.hallId),
      startsAt: fromDateTimeLocal(form.startsAt),
      basePrice: Number(form.basePrice),
    };
    try {
      if (editing === 'new') {
        await api('/admin/sessions', { method: 'POST', token, body: JSON.stringify(body) });
        toast('success', 'Сеанс добавлен в афишу');
      } else if (editing) {
        await api(`/admin/sessions/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
        toast('success', 'Сеанс обновлён');
      }
      setEditing(null);
      list.retry();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Не удалось сохранить сеанс');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: AdminSession) => {
    setConfirmId(null);
    setBusyId(s.id);
    try {
      await api(`/admin/sessions/${s.id}`, { method: 'DELETE', token });
      toast('success', `Сеанс «${s.movie.title}» удалён`);
      list.retry();
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Не удалось удалить сеанс');
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
            placeholder="Поиск по фильму или залу…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            aria-label="Поиск сеансов"
          />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => open('new')}>
          Добавить сеанс
        </button>
      </div>

      {list.loading && !list.data ? (
        <Loader label="Загружаем сеансы…" />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.retry} />
      ) : list.data && list.data.items.length === 0 ? (
        <div className="state-box">
          <h3>Сеансов нет</h3>
          <p>Добавьте первый сеанс — он сразу появится в афише.</p>
          <button className="btn btn-primary" onClick={() => open('new')}>
            Добавить сеанс
          </button>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Фильм</th>
                  <th>Зал</th>
                  <th>Начало</th>
                  <th>Базовая цена</th>
                  <th>Продано</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-media">
                        <img src={s.movie.posterUrl} alt="" loading="lazy" />
                        <b>{s.movie.title}</b>
                      </div>
                    </td>
                    <td>{s.hall.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(s.startsAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtPrice(s.basePrice)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {s.soldSeats} / {s.hall.totalSeats}{' '}
                      {plural(s.hall.totalSeats, 'место', 'места', 'мест')}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Изменить сеанс"
                          aria-label="Изменить сеанс"
                          onClick={() => open(s)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
                            <path d="m14.5 6.5 3 3" />
                          </svg>
                        </button>
                        {confirmId === s.id ? (
                          <>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busyId === s.id}
                              onClick={() => remove(s)}
                            >
                              Удалить?
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                              Нет
                            </button>
                          </>
                        ) : (
                          <button
                            className="icon-btn no"
                            title="Удалить сеанс"
                            aria-label="Удалить сеанс"
                            disabled={busyId === s.id}
                            onClick={() => setConfirmId(s.id)}
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

      {editing && (
        <Modal title={editing === 'new' ? 'Новый сеанс' : 'Изменить сеанс'} onClose={() => setEditing(null)}>
          <form className="form-grid" onSubmit={submit} noValidate>
            {bindingLocked && (
              <p className="booking-hint">
                По сеансу проданы билеты ({editing.soldSeats}), поэтому зал и фильм менять нельзя — можно
                изменить время и цену.
              </p>
            )}
            <div className="field">
              <label htmlFor="sf-movie">Фильм</label>
              <select
                id="sf-movie"
                className="select"
                value={form.movieId}
                disabled={bindingLocked}
                title={bindingLocked ? 'Нельзя менять фильм: есть проданные билеты' : undefined}
                onChange={(e) => setForm((f) => ({ ...f, movieId: e.target.value }))}
              >
                <option value="">Выберите фильм…</option>
                {movies.data?.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.year})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-hall">Зал</label>
              <select
                id="sf-hall"
                className="select"
                value={form.hallId}
                disabled={bindingLocked}
                title={bindingLocked ? 'Нельзя менять зал: есть проданные билеты' : undefined}
                onChange={(e) => setForm((f) => ({ ...f, hallId: e.target.value }))}
              >
                <option value="">Выберите зал…</option>
                {halls.data?.items.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.seatsCount} мест
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sf-starts">Дата и время</label>
              <input
                id="sf-starts"
                className="input"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="sf-price">Базовая цена, ₽</label>
              <input
                id="sf-price"
                className="input"
                type="number"
                min={50}
                step={10}
                value={form.basePrice}
                onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
              />
            </div>
            {formError && (
              <div className="form-alert" role="alert">
                {formError}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
                Отмена
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Сохраняем…' : editing === 'new' ? 'Добавить' : 'Сохранить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
