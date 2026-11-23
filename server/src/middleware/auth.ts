import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../errors.js';

// Без секрета любой смог бы подделать админ-токен, поэтому падаем при старте.
const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET не задан: скопируйте server/.env.example в server/.env и укажите секрет.');
}
export const JWT_SECRET = secret;

export interface AdminToken {
  sub: number;
  login: string;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized('Ожидается Bearer-токен'));
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as unknown as AdminToken;
    (req as Request & { admin: AdminToken }).admin = payload;
    next();
  } catch {
    next(unauthorized('Токен недействителен или истёк'));
  }
}

export const getAdmin = (req: Request) => (req as Request & { admin: AdminToken }).admin;
