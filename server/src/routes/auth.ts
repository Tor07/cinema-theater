import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../prisma.js';
import { unauthorized } from '../errors.js';
import { loginBody, parse } from '../validation.js';
import { getAdmin, JWT_SECRET, requireAdmin } from '../middleware/auth.js';

export const authRouter = Router();

// Защита от перебора пароля: не более 10 попыток входа с одного IP за 15 минут.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.' },
});

authRouter.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { login, password } = parse(loginBody, req.body);
    const admin = await prisma.admin.findUnique({ where: { login } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw unauthorized('Неверный логин или пароль');
    }
    const token = jwt.sign({ sub: admin.id, login: admin.login }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, login: admin.login, expiresIn: 12 * 3600 });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/auth/me', requireAdmin, (req, res) => {
  res.json({ login: getAdmin(req).login });
});
