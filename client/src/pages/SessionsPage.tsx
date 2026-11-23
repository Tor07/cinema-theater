import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useDebounced, useFetch } from '../lib/hooks';
import { dateLabel, plural } from '../lib/format';
import type { Filters, Session } from '../types';
import { SessionCard } from '../components/SessionCard';
import { ErrorBox } from '../components/ErrorBox';
import { SkeletonGrid } from '../components/Loader';

export function SessionsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const genre = params.get('genre') ?? '';
  const age = params.get('age') ?? '';
  const date = params.get('date') ?? '';
  const top = params.get('top') === '1';

  const [qInput, setQInput] = useState(q);
  const qDebounced = useDebounced(qInput, 350);

  // Внешние изменения URL (кнопки назад/вперёд, сброс фильтров) отражаются в поле поиска.
  useEffect(() => setQInput(q), [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (qDebounced.trim()) p.set('q', qDebounced.trim());
    if (genre) p.set('genre', genre);
    if (age) p.set('ageRating', age);
    if (date) p.set('date', date);
    if (top) p.set('top', '1');
    return p.toString();
  }, [qDebounced, genre, age, date, top]);

  const filters = useFetch<Filters>(() => api('/filters'), []);
  const sessions = useFetch<{ items: Session[]; total: number }>(
    () => api(`/sessions${query ? `?${query}` : ''}`),
    [query],
  );

  const hasFilters = !!(q || genre || age || date || top);
  const resetAll = () => {
    setQInput('');
    setParams(new URLSearchParams(), { replace: true });
  };

  const todayCount =
    sessions.data?.items.filter((s) => {
      const d = new Date(s.startsAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length ?? 0;

  const hallsCount = filters.data?.halls.length;
  const hallsWord = hallsCount != null ? plural(hallsCount, 'зал', 'зала', 'залов') : 'зала';

  return (
    <div className="container">
      <header className="hero">
        <div className="hero-side">
          <div>
            <div className="hero-kicker">
              Большое кино{hallsCount ? ` · ${hallsCount} ${hallsWord}` : ''} · каждый день
            </div>
            <h1 className="hero-title">Сегодня в кино</h1>
            <p className="hero-sub">
              Выберите сеанс и место на карте зала — билеты заберёте в кассе по коду заказа.
            </p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <b>{sessions.data ? todayCount : '—'}</b>
              <span>сеансов сегодня</span>
            </div>
            <div className="hero-stat">
              <b>{filters.data?.genres.length ?? '—'}</b>
              <span>жанров</span>
            </div>
            <div className="hero-stat">
              <b>{hallsCount ?? '—'}</b>
              <span>{hallsWord}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="filters" aria-label="Поиск сеансов">
        <div className="quick-filters">
          <button
            className={`quick-chip ${top ? 'on' : ''}`}
            aria-pressed={top}
            onClick={() => setParam('top', top ? '' : '1')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
            </svg>
            Топ-10 Кинопоиска
          </button>
          <span className="quick-hint">Подборка из рейтинга «250 лучших фильмов»</span>
        </div>
        <div className="filters-grid">
          <div className="field">
            <label htmlFor="f-q">Название фильма</label>
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
                id="f-q"
                className="input"
                type="search"
                placeholder="Например, Интерстеллар…"
                value={qInput}
                onChange={(e) => {
                  setQInput(e.target.value);
                  setParam('q', e.target.value);
                }}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-genre">Жанр</label>
            <select
              id="f-genre"
              className="select"
              value={genre}
              onChange={(e) => setParam('genre', e.target.value)}
            >
              <option value="">Все жанры</option>
              {filters.data?.genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-age">Возраст</label>
            <select
              id="f-age"
              className="select"
              value={age}
              onChange={(e) => setParam('age', e.target.value)}
            >
              <option value="">Любой</option>
              {filters.data?.ageRatings.map((a) => (
                <option key={a} value={a}>
                  {a}+
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-date">Дата</label>
            <select
              id="f-date"
              className="select"
              value={date}
              onChange={(e) => setParam('date', e.target.value)}
            >
              <option value="">Все дни</option>
              {filters.data?.dates.map((d) => (
                <option key={d} value={d}>
                  {dateLabel(d)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={resetAll} disabled={!hasFilters && !qInput}>
            Сбросить
          </button>
        </div>

        <div className="filters-meta">
          <span className="result-count" aria-live="polite">
            {sessions.loading ? (
              'Ищем сеансы…'
            ) : sessions.data ? (
              <>
                Найдено <b>{sessions.data.total}</b>{' '}
                {plural(sessions.data.total, 'сеанс', 'сеанса', 'сеансов')}
              </>
            ) : (
              ''
            )}
          </span>
          <div className="active-filters">
            {q && (
              <button
                className="filter-tag"
                onClick={() => {
                  setQInput('');
                  setParam('q', '');
                }}
              >
                «{q}» <i>✕</i>
              </button>
            )}
            {genre && (
              <button className="filter-tag" onClick={() => setParam('genre', '')}>
                {genre} <i>✕</i>
              </button>
            )}
            {age && (
              <button className="filter-tag" onClick={() => setParam('age', '')}>
                {age}+ <i>✕</i>
              </button>
            )}
            {date && (
              <button className="filter-tag" onClick={() => setParam('date', '')}>
                {dateLabel(date)} <i>✕</i>
              </button>
            )}
            {top && (
              <button className="filter-tag" onClick={() => setParam('top', '')}>
                Топ-10 КП <i>✕</i>
              </button>
            )}
          </div>
        </div>
      </section>

      {sessions.loading && !sessions.data ? (
        <SkeletonGrid />
      ) : sessions.error ? (
        <ErrorBox error={sessions.error} onRetry={sessions.retry} />
      ) : sessions.data && sessions.data.items.length === 0 ? (
        <div className="state-box">
          <h3>Сеансы не найдены</h3>
          <p>Попробуйте изменить запрос или сбросить фильтры.</p>
          <button className="btn btn-ghost" onClick={resetAll}>
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div className="sessions-grid">
          {sessions.data?.items.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
