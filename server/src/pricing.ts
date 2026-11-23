export const TIER_MUL: Record<string, number> = { standard: 1, comfort: 1.4, vip: 1.8 };

export const TIER_LABEL: Record<string, string> = {
  standard: 'Стандарт',
  comfort: 'Комфорт',
  vip: 'VIP',
};

export const seatPrice = (basePrice: number, tier: string) =>
  Math.round((basePrice * (TIER_MUL[tier] ?? 1)) / 10) * 10;
