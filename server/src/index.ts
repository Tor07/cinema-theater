import './env.js';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { initDb } from './seed.js';
import { ensureUpcomingSchedule } from './autofill.js';
import { ensureDbIndexes } from './db-indexes.js';
import { ApiError } from './errors.js';
import { sessionsRouter } from './routes/sessions.js';
import { ordersRouter } from './routes/orders.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { openapiDocument } from './swagger.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', sessionsRouter);
app.use('/api', ordersRouter);
app.use('/api', authRouter);
app.use('/api', adminRouter);

app.get('/api/docs.json', (_req, res) => res.json(openapiDocument));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiDocument, {
    customSiteTitle: 'Кинотеатр «Аврора» — API',
  }),
);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Метод API не найден' }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const port = Number(process.env.PORT ?? 4000);

// Цепочка старта: сид недостающего → страховочный индекс мест → автофилл расписания.
initDb()
  .then(() =>
    ensureDbIndexes().catch((e) => {
      // Без индекса приложение продолжает работать на проверках в транзакциях,
      // но страховка БД отключена — сообщаем громко и не валим сервер.
      console.error('[db] страховочный индекс uq_order_items_active_seat не создан:', e);
    }),
  )
  .then(() => ensureUpcomingSchedule())
  .then(() => {
    app.listen(port, () => {
      console.log(`[api] http://localhost:${port}/api`);
      console.log(`[docs] http://localhost:${port}/api/docs`);
    });
    setInterval(() => {
      ensureUpcomingSchedule().catch((e) => console.error('[autofill]', e));
    }, 3_600_000);
  })
  .catch((e) => {
    console.error('[db] init failed:', e);
    process.exit(1);
  });
