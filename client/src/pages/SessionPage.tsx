import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiClientError } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { ageLabel, fmtDate, fmtDuration, fmtPrice, fmtTime, fmtWeekday } from '../lib/format';
import type { SessionDetails } from '../types';
import { ErrorBox } from '../components/ErrorBox';
import { Loader } from '../components/Loader';
import { TicketWidget, WidgetSubmitError, type WidgetOrderPayload } from '../widgets/TicketWidget';

interface SeatsResponse {
  hall: { name: string; rows: number; seatsPerRow: number };
  tiers: { tier: 'standard' | 'comfort' | 'vip'; label: string; price: number }[];
  seats: {
    id: number;
    row: number;
    number: number;
    tier: 'standard' | 'comfort' | 'vip';
    price: number;
    occupied: boolean;
  }[];
}

export function SessionPage() {
  const { id } = useParams();
  const sessionId = Number(id);

  const session = useFetch<SessionDetails>(() => api(`/sessions/${sessionId}`), [sessionId]);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  if (session.loading && !session.data) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <Loader label="Загружаем сеанс…" />
      </div>
    );
  }
  if (session.error && !session.data) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <Link to="/" className="back-link">
          ← Назад к афише
        </Link>
        <ErrorBox error={session.error} onRetry={session.retry} />
      </div>
    );
  }
  const s = session.data!;
  const m = s.movie;
  const showtimes = [s, ...s.otherSessions];
  const chosen = showtimes.find((o) => o.id === (chosenId ?? s.id)) ?? s;

  return (
    <>
      <header className="detail-hero">
        <div className="container">
          <Link to="/" className="back-link">
            ← Назад к афише
          </Link>
          <div className="detail-grid">
            <div className="detail-poster">
              <img src={m.posterUrl} alt={`Постер: ${m.title}`} />
            </div>
            <div className="detail-info">
              <div className="detail-kicker">
                <span className="badge badge-genre">{m.genre}</span>
                <span className="badge badge-rating">★ {m.rating.toFixed(1)}</span>
                <span className={`age-chip age-${m.ageRating}`}>{ageLabel(m.ageRating)}</span>
                <span className="badge badge-hall">{s.hall.name}</span>
                {m.kpRank && <span className="badge badge-kp">№{m.kpRank} в топ-250 Кинопоиска</span>}
              </div>
              <h1 className="detail-title">{m.title}</h1>
              <p className="detail-original">
                {[m.originalTitle, m.year && `${m.year}`, fmtDuration(m.durationMin)]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                · сеанс {fmtWeekday(s.startsAt)}, {fmtDate(s.startsAt)} в <b>{fmtTime(s.startsAt)}</b> · от{' '}
                {fmtPrice(s.basePrice)}
              </p>
              <dl className="detail-credits">
                {m.director && (
                  <div className="credit-row">
                    <dt>Режиссёр</dt>
                    <dd>{m.director}</dd>
                  </div>
                )}
                {m.screenwriter && (
                  <div className="credit-row">
                    <dt>Сценарист</dt>
                    <dd>{m.screenwriter}</dd>
                  </div>
                )}
                {m.cast.length > 0 && (
                  <div className="credit-row">
                    <dt>В ролях</dt>
                    <dd>
                      <div className="cast-chips">
                        {m.cast.map((a) => (
                          <span key={a} className="cast-chip">
                            {a}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}
              </dl>
              <p className="detail-desc">{m.description}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container detail-layout">
        {m.trailerUrl && (
          <div className="detail-main">
            <h2 className="section-title">Трейлер</h2>
            <div className="trailer-frame">
              <iframe
                src={m.trailerUrl}
                title={`Трейлер: ${m.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        <aside className="detail-aside">
          <h2 className="section-title">Покупка билета</h2>
          {bookingOpen ? (
            <>
              <button type="button" className="back-link" onClick={() => setBookingOpen(false)}>
                ← выбрать другой сеанс
              </button>
              <SeatBooking
                sessionId={chosen.id}
                sessionLabel={`${m.title} · ${fmtWeekday(chosen.startsAt)}, ${fmtDate(chosen.startsAt)}, ${fmtTime(chosen.startsAt)}`}
              />
            </>
          ) : (
            <div className="booking-picker">
              <p className="booking-hint">
                Выберите дату и время показа — откроется карта зала для этого сеанса.
              </p>
              <div className="booking-times">
                {showtimes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`booking-time ${chosen.id === o.id ? 'on' : ''}`}
                    onClick={() => setChosenId(o.id)}
                  >
                    <b>{fmtTime(o.startsAt)}</b>
                    <span>
                      {fmtWeekday(o.startsAt)}, {fmtDate(o.startsAt)} · {o.hall.name}
                    </span>
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => setBookingOpen(true)}>
                Купить билет
              </button>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function SeatBooking({ sessionId, sessionLabel }: { sessionId: number; sessionLabel: string }) {
  const seats = useFetch<SeatsResponse>(() => api(`/sessions/${sessionId}/seats`), [sessionId]);

  const submitOrder = async (payload: WidgetOrderPayload) => {
    try {
      const r = await api<{
        code: string;
        total: number;
        seats: { row: number; number: number; tier: 'standard' | 'comfort' | 'vip'; price: number }[];
      }>('/orders', { method: 'POST', body: JSON.stringify({ sessionId, ...payload }) });
      seats.retry();
      return { code: r.code, total: r.total, seats: r.seats };
    } catch (e) {
      if (e instanceof ApiClientError) throw new WidgetSubmitError(e.message, e.status === 409);
      throw e;
    }
  };

  if (seats.loading && !seats.data) return <Loader label="Строим карту зала…" />;
  if (seats.error) return <ErrorBox error={seats.error} onRetry={seats.retry} />;
  return (
    <TicketWidget
      key={sessionId}
      seatMap={seats.data!}
      sessionLabel={sessionLabel}
      onSubmit={submitOrder}
      onRefresh={seats.retry}
    />
  );
}
