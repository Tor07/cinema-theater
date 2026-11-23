import { useMemo } from 'react';
import type { WidgetSeat, WidgetSeatMap } from './types';

interface SeatMapProps {
  seatMap: WidgetSeatMap;
  selected: Set<number>;
  onToggle: (seat: WidgetSeat) => void;
}

export function SeatMap({ seatMap, selected, onToggle }: SeatMapProps) {
  const rows = useMemo(() => {
    const byRow = new Map<number, WidgetSeat[]>();
    for (const s of seatMap.seats) {
      const list = byRow.get(s.row) ?? [];
      list.push(s);
      byRow.set(s.row, list);
    }
    return [...byRow.entries()].sort((a, b) => a[0] - b[0]);
  }, [seatMap]);

  const aisleAfter = Math.ceil(seatMap.hall.seatsPerRow / 2);

  return (
    <div>
      <div className="tw-screen" aria-hidden>
        <svg viewBox="0 0 300 26" preserveAspectRatio="none">
          <path
            d="M8 20 Q150 4 292 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div className="tw-screen-label">Экран</div>
      </div>

      <div className="tw-hall" role="group" aria-label="Карта зала">
        {rows.map(([rowNum, seats]) => (
          <div className="tw-row" key={rowNum}>
            <span className="tw-row-num">{rowNum}</span>
            <div className="tw-seats">
              {seats.map((seat, i) => (
                <span key={seat.id} style={{ display: 'contents' }}>
                  {i === aisleAfter && <span className="tw-aisle" aria-hidden />}
                  <button
                    type="button"
                    className={[
                      'tw-seat',
                      seat.tier,
                      seat.occupied ? 'occupied' : '',
                      selected.has(seat.id) ? 'selected' : '',
                    ].join(' ')}
                    disabled={seat.occupied}
                    aria-pressed={selected.has(seat.id)}
                    aria-label={
                      seat.occupied
                        ? `Ряд ${seat.row}, место ${seat.number} — занято`
                        : `Ряд ${seat.row}, место ${seat.number}, ${seat.price} рублей`
                    }
                    title={
                      seat.occupied
                        ? 'Место занято'
                        : `Ряд ${seat.row} · место ${seat.number} · ${seat.price} ₽`
                    }
                    onClick={() => onToggle(seat)}
                  >
                    {seat.number}
                  </button>
                </span>
              ))}
            </div>
            <span className="tw-row-num">{rowNum}</span>
          </div>
        ))}
      </div>

      <div className="tw-legend">
        {seatMap.tiers.map((t) => (
          <span className="tw-legend-item" key={t.tier}>
            <span className={`tw-legend-swatch ${t.tier}`} />
            {t.label} <b>{t.price} ₽</b>
          </span>
        ))}
        <span className="tw-legend-item">
          <span className="tw-legend-swatch selected" /> Выбрано
        </span>
        <span className="tw-legend-item">
          <span className="tw-legend-swatch occupied" /> Занято
        </span>
      </div>
    </div>
  );
}
