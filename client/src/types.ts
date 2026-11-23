export interface MovieShort {
  id: number;
  title: string;
  originalTitle: string;
  year: number;
  genre: string;
  ageRating: number;
  durationMin: number;
  posterUrl: string;
  rating: number;
  kpRank: number | null;
}

export interface MovieFull extends MovieShort {
  director: string;
  screenwriter: string;
  cast: string[];
  description: string;
  trailerUrl: string;
}

export interface Session {
  id: number;
  startsAt: string;
  basePrice: number;
  soldSeats: number;
  hall: { id: number; name: string; totalSeats: number };
  movie: MovieShort;
}

export interface SessionDetails extends Omit<Session, 'movie'> {
  movie: MovieFull;
  otherSessions: Session[];
}

export interface Filters {
  genres: string[];
  ageRatings: number[];
  dates: string[];
  halls: string[];
}

export type OrderStatus = 'new' | 'confirmed' | 'cancelled';

export interface AdminOrder {
  id: number;
  code: string;
  customer: { name: string; email: string; phone: string };
  total: number;
  status: OrderStatus;
  isDemo: boolean;
  createdAt: string;
  session: {
    id: number;
    startsAt: string;
    movieTitle: string;
    posterUrl: string;
    hallName: string;
  };
  seats: { seatId: number; row: number; number: number; tier: string; price: number }[];
}

export interface AdminStats {
  orders_total: number;
  orders_new: number;
  orders_confirmed: number;
  orders_cancelled: number;
  revenue: number;
  revenue_today: number;
  ticketsSold: number;
}

export interface AdminMovie extends MovieFull {
  sessionsCount: number;
}

export interface AdminSession {
  id: number;
  startsAt: string;
  basePrice: number;
  soldSeats: number;
  hall: { id: number; name: string; totalSeats: number };
  movie: { id: number; title: string; posterUrl: string };
}

export interface Hall {
  id: number;
  name: string;
  rows: number;
  seatsPerRow: number;
  seatsCount: number;
}
