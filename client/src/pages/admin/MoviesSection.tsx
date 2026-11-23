import { useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '../../lib/api';
import { useDebounced, useFetch } from '../../lib/hooks';
import { fmtDuration, plural } from '../../lib/format';
import type { AdminMovie } from '../../types';
import { ErrorBox } from '../../components/ErrorBox';
import { Loader } from '../../components/Loader';
import { Pager } from '../../components/Pager';
import { Modal } from './Modal';
import type { ToastFn } from '../../lib/toast';

interface MovieForm {
  title: string;
  originalTitle: string;
  year: string;
  genre: string;
  ageRating: string;
  durationMin: string;
  director: string;
  screenwriter: string;
  cast: string;
  description: string;
  posterUrl: string;
  trailerUrl: string;
  rating: string;
  kpRank: string;
}

const emptyForm = (): MovieForm => ({
  title: '',
  originalTitle: '',
  year: String(new Date().getFullYear()),
  genre: '',
  ageRating: '16',
  durationMin: '120',
  director: '',
  screenwriter: '',
  cast: '',
  description: '',
  posterUrl: '',
  trailerUrl: '',
  rating: '7.0',
  kpRank: '',
});

const toForm = (m: AdminMovie): MovieForm => ({
  title: m.title,
  originalTitle: m.originalTitle,
  year: String(m.year),
  genre: m.genre,
  ageRating: String(m.ageRating),
  durationMin: String(m.durationMin),
  director: m.director,
  screenwriter: m.screenwriter,
  cast: m.cast.join(', '),
  description: m.description,
  posterUrl: m.posterUrl,
  trailerUrl: m.trailerUrl,
  rating: String(m.rating),
  kpRank: m.kpRank === null ? '' : String(m.kpRank),
});

const AGE_RATINGS = [0, 6, 12, 16, 18];

export function MoviesSection({ token, toast }: { token: string; toast: ToastFn }) {
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

  const list = useFetch<{ items: AdminMovie[]; total: number; page: number; pageSize: number }>(
    () => api(`/admin/movies?${query}`, { token }),
    [query, token],
  );

  // После удаления последней записи на странице возвращаемся на предыдущую.
  useEffect(() => {
    if (list.data && list.data.items.length === 0 && list.data.total > 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(list.data.total / list.data.pageSize)));
    }
  }, [list.data, page]);

  const [editing, setEditing] = useState<AdminMovie | 'new' | null>(null);
  const [form, setForm] = useState<MovieForm>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const set =
    (key: keyof MovieForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const open = (target: AdminMovie | 'new') => {
    setFormError(null);
    setIssues([]);
    setForm(target === 'new' ? emptyForm() : toForm(target));
    setEditing(target);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setIssues([]);
    const body = {
      title: form.title,
      originalTitle: form.originalTitle,
      year: Number(form.year),
      genre: form.genre,
      ageRating: Number(form.ageRating),
      durationMin: Number(form.durationMin),
      director: form.director,
      screenwriter: form.screenwriter,
      cast: form.cast
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: form.description,
      posterUrl: form.posterUrl,
      trailerUrl: form.trailerUrl,
      rating: Number(form.rating),
      kpRank: form.kpRank.trim() === '' ? null : Number(form.kpRank),
    };
    try {
      if (editing === 'new') {
        await api('/admin/movies', { method: 'POST', token, body: JSON.stringify(body) });
        toast('success', `Фильм «${form.title}» добавлен`);
      } else if (editing) {
        await api(`/admin/movies/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
        toast('success', `Фильм «${form.title}» обновлён`);
      }
      setEditing(null);
      list.retry();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
        setIssues(err.details ?? []);
      } else {
        setFormError('Не удалось сохранить фильм');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: AdminMovie) => {
    setConfirmId(null);
    setBusyId(m.id);
    try {
      await api(`/admin/movies/${m.id}`, { method: 'DELETE', token });
      toast('success', `Фильм «${m.title}» удалён вместе с сеансами`);
      list.retry();
    } catch (err) {
      toast('error', err instanceof ApiClientError ? err.message : 'Не удалось удалить фильм');
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
            placeholder="Поиск по названию…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            aria-label="Поиск фильмов"
          />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => open('new')}>
          Добавить фильм
        </button>
      </div>

      {list.loading && !list.data ? (
        <Loader label="Загружаем фильмы…" />
      ) : list.error ? (
        <ErrorBox error={list.error} onRetry={list.retry} />
      ) : list.data && list.data.items.length === 0 ? (
        <div className="state-box">
          <h3>Фильмов нет</h3>
          <p>Добавьте фильм в каталог — после этого можно будет создавать сеансы.</p>
          <button className="btn btn-primary" onClick={() => open('new')}>
            Добавить фильм
          </button>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Фильм</th>
                  <th>Жанр</th>
                  <th>Год</th>
                  <th>Длительность</th>
                  <th>Рейтинг</th>
                  <th>Сеансы</th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-media">
                        <img src={m.posterUrl} alt="" loading="lazy" />
                        <span>
                          <b>{m.title}</b>
                          <small>{m.originalTitle}</small>
                        </span>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{m.genre}</td>
                    <td>{m.year}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDuration(m.durationMin)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.rating.toFixed(1)}
                      {m.kpRank !== null && <span className="rank-tag">№{m.kpRank} топ КП</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.sessionsCount} {plural(m.sessionsCount, 'сеанс', 'сеанса', 'сеансов')}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Изменить фильм"
                          aria-label="Изменить фильм"
                          onClick={() => open(m)}
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
                        {confirmId === m.id ? (
                          <>
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busyId === m.id}
                              onClick={() => remove(m)}
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
                            title="Удалить фильм"
                            aria-label="Удалить фильм"
                            disabled={busyId === m.id}
                            onClick={() => setConfirmId(m.id)}
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
        <Modal
          title={editing === 'new' ? 'Новый фильм' : `Фильм: ${editing.title}`}
          onClose={() => setEditing(null)}
        >
          <form className="form-grid two-col" onSubmit={submit} noValidate>
            <div className="field span-2">
              <label htmlFor="mf-title">Название</label>
              <input id="mf-title" className="input" value={form.title} onChange={set('title')} required />
            </div>
            <div className="field">
              <label htmlFor="mf-original">Оригинальное название (необязательно)</label>
              <input
                id="mf-original"
                className="input"
                value={form.originalTitle}
                onChange={set('originalTitle')}
              />
            </div>
            <div className="field">
              <label htmlFor="mf-genre">Жанр</label>
              <input
                id="mf-genre"
                className="input"
                value={form.genre}
                onChange={set('genre')}
                placeholder="драма"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mf-year">Год</label>
              <input
                id="mf-year"
                className="input"
                type="number"
                min={1880}
                max={2100}
                value={form.year}
                onChange={set('year')}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mf-duration">Длительность, мин</label>
              <input
                id="mf-duration"
                className="input"
                type="number"
                min={1}
                max={600}
                value={form.durationMin}
                onChange={set('durationMin')}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mf-age">Возраст</label>
              <select id="mf-age" className="select" value={form.ageRating} onChange={set('ageRating')}>
                {AGE_RATINGS.map((a) => (
                  <option key={a} value={a}>
                    {a}+
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mf-rating">Рейтинг (0–10)</label>
              <input
                id="mf-rating"
                className="input"
                type="number"
                min={0}
                max={10}
                step="0.1"
                value={form.rating}
                onChange={set('rating')}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mf-director">Режиссёр (необязательно)</label>
              <input id="mf-director" className="input" value={form.director} onChange={set('director')} />
            </div>
            <div className="field">
              <label htmlFor="mf-writer">Сценарист (необязательно)</label>
              <input
                id="mf-writer"
                className="input"
                value={form.screenwriter}
                onChange={set('screenwriter')}
              />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-cast">Актёры через запятую (необязательно)</label>
              <input
                id="mf-cast"
                className="input"
                value={form.cast}
                onChange={set('cast')}
                placeholder="Имя Фамилия, Имя Фамилия"
              />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-desc">Описание</label>
              <textarea
                id="mf-desc"
                className="textarea"
                rows={4}
                value={form.description}
                onChange={set('description')}
                required
              />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-poster">Постер (URL или путь)</label>
              <input
                id="mf-poster"
                className="input"
                value={form.posterUrl}
                onChange={set('posterUrl')}
                required
              />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-trailer">Трейлер (URL, необязательно)</label>
              <input id="mf-trailer" className="input" value={form.trailerUrl} onChange={set('trailerUrl')} />
            </div>
            <div className="field span-2">
              <label htmlFor="mf-rank">Место в топе Кинопоиска (пусто — нет)</label>
              <input
                id="mf-rank"
                className="input"
                type="number"
                min={1}
                value={form.kpRank}
                onChange={set('kpRank')}
                placeholder="—"
              />
            </div>

            {(formError || issues.length > 0) && (
              <div className="form-alert" role="alert">
                {formError}
                {issues.length > 0 && (
                  <ul>
                    {issues.map((i) => (
                      <li key={`${i.field}:${i.message}`}>
                        <code>{i.field}</code> — {i.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="form-actions span-2">
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
