import { Link } from 'react-router-dom';
import type { Session } from '../types';
import { ageLabel, fmtDuration, fmtPrice, fmtTime, fmtWeekday, fmtDate, plural } from '../lib/format';

export function SessionCard({ session }: { session: Session }) {
  const { movie } = session;
  const free = session.hall.totalSeats - session.soldSeats;
  const freePct = Math.round((free / session.hall.totalSeats) * 100);
  const hot = freePct < 35;

  return (
    <Link to={`/sessions/${session.id}`} className="session-card">
      <div className="card-poster">
        <img src={movie.posterUrl} alt={`Постер: ${movie.title}`} loading="lazy" />
        <div className="card-top-badges">
          <span className="badge badge-genre">{movie.genre}</span>
          <span className="badge badge-rating">★ {movie.rating.toFixed(1)}</span>
          <span className={`age-chip age-${movie.ageRating}`}>{ageLabel(movie.ageRating)}</span>
        </div>
        <div className="card-time-float">
          <b>{fmtTime(session.startsAt)}</b>
          <span>
            {fmtWeekday(session.startsAt)}, {fmtDate(session.startsAt)}
          </span>
          {movie.kpRank && (
            <span className="card-rank" title={`№${movie.kpRank} в топ-250 Кинопоиска`}>
              №{movie.kpRank} топ КП
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        <h3 className="card-title">
          {movie.title}
          <small>{[movie.originalTitle, movie.year].filter(Boolean).join(' · ')}</small>
        </h3>
        <div className="card-meta">
          <span className="badge badge-hall">{session.hall.name}</span>
          <span className="dur">{fmtDuration(movie.durationMin)}</span>
        </div>

        <div className="card-footer">
          <div className="card-price">
            от <b>{fmtPrice(session.basePrice)}</b>
          </div>
          <div className="seats-left">
            <span>
              {free} {plural(free, 'место', 'места', 'мест')} свободно
            </span>
            <div className={`seats-bar ${hot ? 'hot' : ''}`}>
              <i style={{ width: `${freePct}%` }} />
            </div>
          </div>
          <span className="card-buy">Билеты</span>
        </div>
      </div>
    </Link>
  );
}
