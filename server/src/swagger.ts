// Properties схем ввода вынесены в константы: PATCH-варианты (все поля
// необязательны) переиспользуют их без дублей.
const movieInputProperties = {
  title: { type: 'string', example: 'Интерстеллар' },
  originalTitle: { type: 'string', example: 'Interstellar' },
  year: { type: 'integer', example: 2014 },
  genre: { type: 'string', example: 'Фантастика' },
  ageRating: { type: 'integer', enum: [0, 6, 12, 16, 18] },
  durationMin: { type: 'integer', example: 169 },
  director: { type: 'string' },
  screenwriter: { type: 'string' },
  cast: { type: 'array', items: { type: 'string' } },
  description: { type: 'string' },
  posterUrl: { type: 'string', example: '/posters/interstellar.jpg' },
  trailerUrl: { type: 'string', example: 'https://www.youtube.com/embed/zSWdZVtXT7E' },
  rating: { type: 'number', minimum: 0, maximum: 10, example: 8.6 },
  kpRank: { type: 'integer', nullable: true, description: 'Место в топ-250 Кинопоиска или null' },
};

const sessionInputProperties = {
  movieId: { type: 'integer', example: 1 },
  hallId: { type: 'integer', example: 1 },
  startsAt: { type: 'string', format: 'date-time', example: '2026-11-30T18:30:00.000Z' },
  basePrice: {
    type: 'integer',
    minimum: 50,
    example: 400,
    description: 'Базовая цена; цены мест считаются от неё',
  },
};

const paginationParams = [
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1 },
    description: 'Номер страницы (с 1). Пагинация включается только вместе с pageSize.',
  },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description:
      'Размер страницы (1–100). Без page/pageSize список отдаётся целиком; total — полное число записей под фильтром.',
  },
];

export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Кинотеатр «Аврора» — REST API',
    version: '1.0.0',
    description:
      'API афиши, сеансов, заказов билетов и панели администратора. ' +
      'Фильтрация и поиск выполняются на сервере. Методы /admin/* требуют Bearer-токен, ' +
      'выдаваемый POST /api/auth/login (демо-доступ: admin / admin123). ' +
      'Демо-заказы генератора витрины помечены isDemo и не учитываются в /admin/stats; ' +
      'генерацию демо-заказов отключает переменная окружения DEMO_MODE=0.',
  },
  servers: [{ url: 'http://localhost:4000', description: 'Локальный сервер разработки' }],
  tags: [
    { name: 'Sessions', description: 'Афиша, сеансы и карта зала' },
    { name: 'Orders', description: 'Оформление заказов на билеты' },
    { name: 'Auth', description: 'Вход администратора' },
    { name: 'Admin', description: 'Панель администратора (Bearer-токен)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Ошибка валидации входных данных' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
      MovieShort: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string', example: 'Интерстеллар' },
          originalTitle: { type: 'string' },
          year: { type: 'integer' },
          genre: { type: 'string', example: 'Фантастика' },
          ageRating: { type: 'integer', example: 12 },
          durationMin: { type: 'integer', example: 169 },
          posterUrl: { type: 'string' },
          rating: { type: 'number', example: 8.6 },
          kpRank: {
            type: 'integer',
            nullable: true,
            example: 1,
            description: 'Место в топ-250 Кинопоиска (null — вне топа)',
          },
        },
      },
      MovieFull: {
        allOf: [
          { $ref: '#/components/schemas/MovieShort' },
          {
            type: 'object',
            properties: {
              director: { type: 'string', example: 'Кристофер Нолан' },
              screenwriter: { type: 'string' },
              cast: { type: 'array', items: { type: 'string' } },
              description: { type: 'string' },
              trailerUrl: { type: 'string', example: 'https://www.youtube.com/embed/zSWdZVtXT7E' },
            },
          },
        ],
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          startsAt: { type: 'string', format: 'date-time' },
          basePrice: { type: 'integer', example: 400 },
          soldSeats: { type: 'integer' },
          hall: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              totalSeats: { type: 'integer' },
            },
          },
          movie: { $ref: '#/components/schemas/MovieShort' },
        },
      },
      SessionDetails: {
        allOf: [
          { $ref: '#/components/schemas/Session' },
          {
            type: 'object',
            properties: {
              movie: { $ref: '#/components/schemas/MovieFull' },
              otherSessions: { type: 'array', items: { $ref: '#/components/schemas/Session' } },
            },
          },
        ],
      },
      SeatMap: {
        type: 'object',
        properties: {
          sessionId: { type: 'integer' },
          hall: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              rows: { type: 'integer' },
              seatsPerRow: { type: 'integer' },
            },
          },
          tiers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tier: { type: 'string', enum: ['standard', 'comfort', 'vip'] },
                label: { type: 'string' },
                price: { type: 'integer' },
              },
            },
          },
          seats: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                row: { type: 'integer' },
                number: { type: 'integer' },
                tier: { type: 'string', enum: ['standard', 'comfort', 'vip'] },
                price: { type: 'integer' },
                occupied: { type: 'boolean' },
              },
            },
          },
        },
      },
      OrderInput: {
        type: 'object',
        required: ['sessionId', 'seatIds', 'customer'],
        properties: {
          sessionId: { type: 'integer', example: 1 },
          seatIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 8, example: [45, 46] },
          customer: {
            type: 'object',
            required: ['name', 'email', 'phone'],
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 80, example: 'Иван Петров' },
              email: { type: 'string', format: 'email', example: 'ivan@example.com' },
              phone: { type: 'string', example: '+7 (912) 345-67-89' },
            },
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          code: { type: 'string', example: 'AV-1A2B3C4D' },
          sessionId: { type: 'integer' },
          customer: {
            type: 'object',
            properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } },
          },
          seats: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                seatId: { type: 'integer' },
                row: { type: 'integer' },
                number: { type: 'integer' },
                tier: { type: 'string' },
                price: { type: 'integer' },
              },
            },
          },
          total: { type: 'integer', example: 1120 },
          status: { type: 'string', enum: ['new', 'confirmed', 'cancelled'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminOrder: {
        allOf: [
          { $ref: '#/components/schemas/Order' },
          {
            type: 'object',
            properties: {
              isDemo: {
                type: 'boolean',
                description: 'Демо-заказ генератора витрины: в /admin/stats не учитывается',
              },
              session: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  startsAt: { type: 'string', format: 'date-time' },
                  movieTitle: { type: 'string' },
                  posterUrl: { type: 'string' },
                  hallName: { type: 'string' },
                },
              },
            },
          },
        ],
      },
      LoginInput: {
        type: 'object',
        required: ['login', 'password'],
        properties: {
          login: { type: 'string', example: 'admin' },
          password: { type: 'string', format: 'password', example: 'admin123' },
        },
      },
      MovieInput: {
        type: 'object',
        // Синхронизировано с zod movieBody: обязательны все ключи, кроме kpRank
        // (пустые строки допустимы — поля можно оставить незаполненными).
        required: [
          'title',
          'originalTitle',
          'year',
          'genre',
          'ageRating',
          'durationMin',
          'director',
          'screenwriter',
          'cast',
          'description',
          'posterUrl',
          'trailerUrl',
          'rating',
        ],
        properties: movieInputProperties,
      },
      MoviePatch: {
        type: 'object',
        description: 'Частичное обновление фильма: все поля необязательны (movieBody.partial()).',
        properties: movieInputProperties,
      },
      SessionInput: {
        type: 'object',
        required: ['movieId', 'hallId', 'startsAt', 'basePrice'],
        properties: sessionInputProperties,
      },
      SessionPatch: {
        type: 'object',
        description: 'Частичное обновление сеанса: все поля необязательны (sessionBody.partial()).',
        properties: sessionInputProperties,
      },
      Hall: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string', example: 'Большой зал' },
          rows: { type: 'integer' },
          seatsPerRow: { type: 'integer' },
          seatsCount: { type: 'integer' },
        },
      },
      AdminSession: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          startsAt: { type: 'string', format: 'date-time' },
          basePrice: { type: 'integer' },
          soldSeats: { type: 'integer' },
          hall: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              totalSeats: { type: 'integer' },
            },
          },
          movie: {
            type: 'object',
            properties: { id: { type: 'integer' }, title: { type: 'string' }, posterUrl: { type: 'string' } },
          },
        },
      },
      Stats: {
        type: 'object',
        description: 'Только реальные заказы (isDemo=false); демо-заказы генератора витрины исключены.',
        properties: {
          orders_total: { type: 'integer' },
          orders_new: { type: 'integer' },
          orders_confirmed: { type: 'integer' },
          orders_cancelled: { type: 'integer' },
          revenue: { type: 'integer' },
          revenue_today: { type: 'integer', description: 'Выручка за локальные сутки сервера (сегодня)' },
          ticketsSold: { type: 'integer' },
        },
      },
    },
  },
  paths: {
    '/api/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'Список сеансов с поиском и фильтрами (на сервере)',
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Поиск по названию фильма (рус/оригинал)',
          },
          { name: 'genre', in: 'query', schema: { type: 'string' }, description: 'Точный жанр' },
          {
            name: 'ageRating',
            in: 'query',
            schema: { type: 'integer' },
            description: 'Возрастной рейтинг (0, 6, 12, 16, 18)',
          },
          {
            name: 'date',
            in: 'query',
            schema: { type: 'string', format: 'date' },
            description: 'Дата сеанса ГГГГ-ММ-ДД — локальный календарный день сервера',
          },
          { name: 'movieId', in: 'query', schema: { type: 'integer' } },
          {
            name: 'top',
            in: 'query',
            schema: { type: 'string', enum: ['1'] },
            description: 'Только фильмы из топ-10 Кинопоиска',
          },
          ...paginationParams,
        ],
        responses: {
          200: {
            description: 'Список сеансов',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/Session' } },
                    total: { type: 'integer', description: 'Полное число записей под фильтром' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Некорректные параметры',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/filters': {
      get: {
        tags: ['Sessions'],
        summary: 'Справочники для фильтров: жанры, рейтинги, даты, залы',
        responses: {
          200: {
            description: 'Справочники',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    genres: { type: 'array', items: { type: 'string' } },
                    ageRatings: { type: 'array', items: { type: 'integer' } },
                    dates: {
                      type: 'array',
                      items: { type: 'string', format: 'date' },
                      description: 'Локальные календарные дни сервера, на которые есть сеансы',
                    },
                    halls: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Названия залов кинотеатра',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/sessions/{id}': {
      get: {
        tags: ['Sessions'],
        summary: 'Подробная информация о сеансе и фильме',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Сеанс',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionDetails' } } },
          },
          404: {
            description: 'Сеанс не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/sessions/{id}/seats': {
      get: {
        tags: ['Sessions'],
        summary: 'Карта зала: места, категории, цены, занятость',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Карта зала',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SeatMap' } } },
          },
          404: {
            description: 'Сеанс не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Оформить заказ на билеты',
        description:
          'Входные данные валидируются; цены пересчитываются на сервере; занятость мест проверяется ' +
          'в транзакции с блокировкой строки сеанса и страхуется уникальным индексом БД. ' +
          'Повторная продажа места невозможна. После начала сеанса продажа билетов закрыта (400).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderInput' } } },
        },
        responses: {
          201: {
            description: 'Заказ создан',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
          400: {
            description: 'Ошибка валидации или сеанс уже начался',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Сеанс не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Места уже заняты',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Вход администратора, выдача Bearer-токена (JWT, 12 ч)',
        description:
          'Не более 10 попыток входа с одного IP за 15 минут; при превышении — 429 (заголовок Retry-After).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: {
          200: {
            description: 'Токен',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    login: { type: 'string' },
                    expiresIn: { type: 'integer' },
                  },
                },
              },
            },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: {
            description: 'Неверный логин или пароль',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          429: {
            description: 'Слишком много попыток входа (лимит: 10 за 15 минут)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Проверка токена',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Текущий администратор',
            content: {
              'application/json': { schema: { type: 'object', properties: { login: { type: 'string' } } } },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/orders': {
      get: {
        tags: ['Admin'],
        summary: 'Все заказы пользователей (поиск, фильтр по статусу)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Поиск по коду, имени, e-mail, телефону, фильму',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['new', 'confirmed', 'cancelled'] },
          },
          ...paginationParams,
        ],
        responses: {
          200: {
            description: 'Заказы',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/AdminOrder' } },
                    total: { type: 'integer', description: 'Полное число записей под фильтром' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Сводная статистика продаж',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Статистика',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats' } } },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/orders/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Изменить статус заказа',
        security: [{ bearerAuth: [] }],
        description:
          'Возврат из «отменён» в активный статус возможен, только если места заказа ' +
          'ещё не проданы другим заказам (иначе 409).',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['new', 'confirmed', 'cancelled'] } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Статус обновлён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, status: { type: 'string' } },
                },
              },
            },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Заказ не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Места заказа уже проданы другим заказам',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Удалить заказ',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Заказ удалён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, deleted: { type: 'boolean' } },
                },
              },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Заказ не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/movies': {
      get: {
        tags: ['Admin'],
        summary: 'Список фильмов с числом сеансов',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Поиск по названию' },
          ...paginationParams,
        ],
        responses: {
          200: {
            description: 'Фильмы',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        allOf: [
                          { $ref: '#/components/schemas/MovieFull' },
                          { type: 'object', properties: { sessionsCount: { type: 'integer' } } },
                        ],
                      },
                    },
                    total: { type: 'integer', description: 'Полное число записей под фильтром' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Добавить фильм',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MovieInput' } } },
        },
        responses: {
          201: {
            description: 'Фильм создан',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MovieFull' } } },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/movies/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Изменить фильм (частично)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/MoviePatch' } } },
        },
        responses: {
          200: {
            description: 'Фильм обновлён',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MovieFull' } } },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Фильм не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Удалить фильм вместе с сеансами',
        security: [{ bearerAuth: [] }],
        description:
          'Запрещено (409), если по сеансам фильма есть любые заказы, включая отменённые: сначала удалите заказы, чтобы не потерять историю.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Фильм удалён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, deleted: { type: 'boolean' } },
                },
              },
            },
          },
          404: {
            description: 'Фильм не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Есть заказы (включая отменённые)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/halls': {
      get: {
        tags: ['Admin'],
        summary: 'Список залов (справочник для создания сеансов)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Залы',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Hall' } } },
                },
              },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/sessions': {
      get: {
        tags: ['Admin'],
        summary: 'Все сеансы (поиск по фильму и залу)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }, ...paginationParams],
        responses: {
          200: {
            description: 'Сеансы',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { $ref: '#/components/schemas/AdminSession' } },
                    total: { type: 'integer', description: 'Полное число записей под фильтром' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          401: {
            description: 'Нет/недействителен токен',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Создать сеанс',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionInput' } } },
        },
        responses: {
          201: {
            description: 'Сеанс создан',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminSession' } } },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Фильм или зал не найдены',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/api/admin/sessions/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Изменить сеанс: фильм, зал, время, цену',
        security: [{ bearerAuth: [] }],
        description:
          'Зал и фильм нельзя менять, если по сеансу есть активные заказы (409): проданные билеты привязаны к местам текущего зала.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionPatch' } } },
        },
        responses: {
          200: {
            description: 'Сеанс обновлён',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminSession' } } },
          },
          400: {
            description: 'Ошибка валидации',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          404: {
            description: 'Сеанс, фильм или зал не найдены',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Зал занят другим сеансом или есть активные заказы',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Удалить сеанс',
        security: [{ bearerAuth: [] }],
        description:
          'Запрещено (409), если по сеансу есть любые заказы, включая отменённые: сначала удалите заказы, чтобы не потерять историю.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: {
            description: 'Сеанс удалён',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'integer' }, deleted: { type: 'boolean' } },
                },
              },
            },
          },
          404: {
            description: 'Сеанс не найден',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          409: {
            description: 'Есть заказы (включая отменённые)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
} as const;
