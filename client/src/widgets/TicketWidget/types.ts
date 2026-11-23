export type SeatTier = 'standard' | 'comfort' | 'vip';

export interface WidgetSeat {
  id: number;
  row: number;
  number: number;
  tier: SeatTier;
  price: number;
  occupied: boolean;
}

export interface WidgetSeatMap {
  hall: { name: string; rows: number; seatsPerRow: number };
  tiers: { tier: SeatTier; label: string; price: number }[];
  seats: WidgetSeat[];
}

export interface WidgetContact {
  name: string;
  email: string;
  phone: string;
}

export interface WidgetOrderPayload {
  seatIds: number[];
  customer: WidgetContact;
}

export interface WidgetOrderResult {
  code: string;
  total: number;
  seats: { row: number; number: number; tier: SeatTier; price: number }[];
}

export interface TicketWidgetProps {
  seatMap: WidgetSeatMap;
  /** Заголовок сеанса для чека, например «Интерстеллар · сегодня 18:40» */
  sessionLabel?: string;
  maxSeats?: number;
  /** Сохранение заказа на сервере. Должен бросить WidgetSubmitError при ошибке. */
  onSubmit: (payload: WidgetOrderPayload) => Promise<WidgetOrderResult>;
  /** Перезапросить карту зала (например после конфликта мест). */
  onRefresh?: () => void;
}

export class WidgetSubmitError extends Error {
  constructor(
    message: string,
    public conflict = false,
  ) {
    super(message);
  }
}
