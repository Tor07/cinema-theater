import { useEffect, useMemo, useRef, useState } from 'react';
import { SeatMap } from './SeatMap';
import {
  WidgetSubmitError,
  type TicketWidgetProps,
  type WidgetContact,
  type WidgetOrderResult,
  type WidgetSeat,
} from './types';
import './ticket-widget.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

function validateContact(c: WidgetContact): Partial<Record<keyof WidgetContact, string>> {
  const errors: Partial<Record<keyof WidgetContact, string>> = {};
  if (c.name.trim().length < 2) errors.name = 'Укажите имя (минимум 2 символа)';
  if (!EMAIL_RE.test(c.email.trim())) errors.email = 'Некорректный e-mail';
  if (!PHONE_RE.test(c.phone.trim())) errors.phone = 'Некорректный номер телефона';
  return errors;
}

export function TicketWidget({
  seatMap,
  sessionLabel,
  maxSeats = 8,
  onSubmit,
  onRefresh,
}: TicketWidgetProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [contact, setContact] = useState<WidgetContact>({ name: '', email: '', phone: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof WidgetContact, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [result, setResult] = useState<WidgetOrderResult | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [bump, setBump] = useState(false);
  const prevTotal = useRef(0);

  const seatById = useMemo(() => new Map(seatMap.seats.map((s) => [s.id, s])), [seatMap]);

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => seatById.get(id) && !seatById.get(id)!.occupied));
      return next.size === prev.size ? prev : next;
    });
  }, [seatById]);

  const chosenSeats = useMemo(
    () =>
      [...selected]
        .map((id) => seatById.get(id)!)
        .filter(Boolean)
        .sort((a, b) => a.row - b.row || a.number - b.number),
    [selected, seatById],
  );
  const total = chosenSeats.reduce((sum, s) => sum + s.price, 0);

  useEffect(() => {
    if (total !== prevTotal.current) {
      prevTotal.current = total;
      setBump(true);
      const t = setTimeout(() => setBump(false), 320);
      return () => clearTimeout(t);
    }
  }, [total]);

  const contactErrors = validateContact(contact);

  const toggleSeat = (seat: WidgetSeat) => {
    if (seat.occupied) return;
    setSubmitError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) {
        next.delete(seat.id);
        setLimitHit(false);
      } else {
        if (next.size >= maxSeats) {
          setLimitHit(true);
          return prev;
        }
        setLimitHit(false);
        next.add(seat.id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true });
    if (chosenSeats.length === 0 || Object.keys(contactErrors).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await onSubmit({
        seatIds: chosenSeats.map((s) => s.id),
        customer: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
      });
      setResult(r);
      setSelected(new Set());
    } catch (err) {
      const conflict = err instanceof WidgetSubmitError && err.conflict;
      setSubmitError({
        message: err instanceof Error ? err.message : 'Не удалось оформить заказ',
        conflict,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setContact({ name: '', email: '', phone: '' });
    setTouched({});
    setSubmitError(null);
    onRefresh?.();
  };

  const field = (
    key: keyof WidgetContact,
    label: string,
    type: string,
    placeholder: string,
    autoComplete: string,
  ) => (
    <div className="tw-field">
      <label htmlFor={`tw-${key}`}>{label}</label>
      <input
        id={`tw-${key}`}
        className={`tw-input ${touched[key] && contactErrors[key] ? 'invalid' : ''}`}
        type={type}
        value={contact[key]}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
        onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
      />
      {touched[key] && contactErrors[key] && <span className="tw-field-err">{contactErrors[key]}</span>}
    </div>
  );

  return (
    <section className="tw" aria-label="Виджет покупки билетов">
      <header className="tw-head">
        <h3>Билеты</h3>
        <span>{sessionLabel ?? seatMap.hall.name}</span>
        {onRefresh && !result && (
          <button type="button" className="tw-refresh" title="Обновить карту зала" onClick={onRefresh}>
            ⟳
          </button>
        )}
      </header>

      <div className="tw-body">
        {result ? (
          <div className="tw-ticket">
            <div className="tw-ticket-icon">✓</div>
            <h4>Заказ оформлен!</h4>
            <p>Билеты сохранены на сервере. Назовите код заказа в кассе.</p>
            <div className="tw-code">{result.code}</div>
            <div className="tw-ticket-seats">
              {result.seats.map((s, i) => (
                <span key={i} className={`tw-chosen-tag`}>
                  ряд {s.row} · место {s.number}
                </span>
              ))}
            </div>
            <div className="tw-ticket-total">
              Итого: <b>{result.total.toLocaleString('ru-RU')} ₽</b>
            </div>
            <button type="button" className="tw-again" onClick={reset}>
              Купить ещё билеты
            </button>
          </div>
        ) : (
          <>
            <SeatMap seatMap={seatMap} selected={selected} onToggle={toggleSeat} />

            <div className="tw-summary">
              {chosenSeats.length === 0 ? (
                <div className="tw-summary-empty">Выберите свободные места на карте зала</div>
              ) : (
                <div className="tw-chosen">
                  {chosenSeats.map((s) => (
                    <span key={s.id} className="tw-chosen-tag">
                      ряд {s.row} · место {s.number} · {s.price} ₽
                      <button
                        type="button"
                        aria-label={`Убрать место ${s.number} в ряду ${s.row}`}
                        onClick={() => toggleSeat(s)}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {limitHit && (
                <div className="tw-field-err" style={{ marginBottom: 8 }}>
                  Не более {maxSeats} мест в одном заказе
                </div>
              )}
              <div className="tw-total">
                <span>
                  Итого · {chosenSeats.length}{' '}
                  {chosenSeats.length === 1
                    ? 'билет'
                    : chosenSeats.length >= 2 && chosenSeats.length <= 4
                      ? 'билета'
                      : 'билетов'}
                </span>
                <b className={bump ? 'bump' : ''}>{total.toLocaleString('ru-RU')} ₽</b>
              </div>
            </div>

            <form className="tw-form" onSubmit={handleSubmit} noValidate>
              {field('name', 'Имя и фамилия', 'text', 'Иван Петров', 'name')}
              {field('email', 'E-mail', 'email', 'ivan@example.com', 'email')}
              {field('phone', 'Телефон', 'tel', '+7 (912) 345-67-89', 'tel')}
              <button className="tw-submit" type="submit" disabled={submitting || chosenSeats.length === 0}>
                {submitting
                  ? 'Оформляем…'
                  : chosenSeats.length > 0
                    ? `Оформить заказ · ${total.toLocaleString('ru-RU')} ₽`
                    : 'Оформить заказ'}
              </button>
            </form>

            {submitError && (
              <div className="tw-alert" role="alert">
                {submitError.message}
                {submitError.conflict && onRefresh && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      onRefresh();
                    }}
                  >
                    Обновить карту зала
                  </button>
                )}
              </div>
            )}
            <p className="tw-note">Оплата при получении в кассе кинотеатра. Заказ сохраняется на сервере.</p>
          </>
        )}
      </div>
    </section>
  );
}
