# Telegram Mini App — Интернет-магазин одежды ATELIER

Полнофункциональный production-ready Telegram Mini App интернет-магазин одежды с каталогом, корзиной, серверным чекаутом, управлением остатками по размерам, модульной платежной архитектурой и полноценной панелью администратора.

---

## 1. Что это

Готовое к запуску решение для онлайн-продаж в Telegram. Продавец подключает Telegram-бота и наполняет магазин через встроенную админ-панель. Покупатель открывает Mini App прямо в мобильном или десктопном клиенте Telegram, выбирает категорию, выбирает товар и размер, добавляет в корзину, оформляет заказ (доставка или самовывоз) и оплачивает его через платежный шлюз.

### Ключевые возможности:
- **Мобильный UX Telegram Mini App**: оптимизирован под сенсорные экраны, поддерживает тактильный отклик (Haptic Feedback), автоматическое расширение viewport (`expand()`) и системные цвета темы Telegram.
- **Безопасная аутентификация**: серверная проверка подписи Telegram `initData` по алгоритму HMAC-SHA256 без передачи секретных токенов во фронтенд.
- **Честный складской учет**: раздельные остатки (Stock) и SKU на уровне каждого размера варианта (S, M, L, XL). Атомарное резервирование в транзакциях БД для защиты от race conditions.
- **Серверный расчет цен**: клиент не является источником правды; при чекауте сервер заново считывает актуальные цены и наличие из базы данных.
- **Абстракция платежей**: интерфейс `PaymentProvider` с реализациями для тестового режима (`MockPaymentProvider`), платежей Telegram (`TelegramPaymentProvider`) и ЮKassa (`YooKassaPaymentProvider`).
- **Идемпотентные вебхуки**: защита от повторных списаний и дублирования обработки событий оплаты.
- **Стейт-машина заказов**: строгие правила перехода статусов (`NEW` → `PAYMENT_PENDING` → `PAID` → `PROCESSING` → `READY` → `COMPLETED`) с возвратом остатка на склад при отмене (`CANCELLED`).
- **Панель администратора**: статистика продаж, мониторинг низких остатков (&lt; 5 шт.), управление товарами и размерами, управление категориями, изменение статусов заказов, база клиентов и аудит уведомлений.

---

## 2. Архитектура системы

Код строго разделен на независимые слои:

```
[ Telegram Client / Web Browser ]
             │
             ▼
[ React + TypeScript Mini App (Client) ]
             │ (HTTP REST API: /api/*)
             ▼
[ Express API Router & Auth Middleware (Server) ]
             │
 ┌───────────┼──────────────────────────┬────────────────────────┐
 │           │                          │                        │
 ▼           ▼                          ▼                        ▼
[ Catalog ] [ CartService ]        [ OrderService ]     [ PaymentService ]
[ Service ]         │                   │                        │
                    └───────┬───────────┘                        │
                            ▼                                    ▼
                [ Atomic Transactions ]                 [ Payment Providers ]
                [ & OrderStateMachine ]                 ├── Mock Provider
                            │                           ├── YooKassa Provider
                            ▼                           └── Telegram Stars
                [ SQLite / Relational DB ]                       │
                            │                                    ▼
                            └──────────────────────────► [ NotificationService ]
                                                                 │
                                                                 ▼
                                                        [ Telegram Bot API ]
```

- **Core & Domain (`src/core/`)**: типы сущностей, доменные ошибки и стейт-машина заказов. Не зависят от UI или базы данных.
- **Database (`src/database/`)**: схема базы данных, миграции, транзакции и сидер демонстрационных данных.
- **Services (`src/services/`)**: бизнес-логика каталога, корзины, заказов и администрирования.
- **Payments (`src/payments/`)**: интерфейс `PaymentProvider`, фабрика провайдеров и сервис обработки вебхуков с контролем идемпотентности.
- **Telegram (`src/telegram/`)**: адаптер бота, проверка криптографической подписи WebApp `initData`, отправка уведомлений.
- **Frontend (`src/client/`, `src/App.tsx`)**: клиентский интерфейс магазина и панели управления с мобильной эргономикой.

---

## 3. Структура проекта

```
├── .env.example              # Образец конфигурационных переменных
├── .gitignore                # Исключения системы контроля версий
├── index.html                # Точка входа HTML с подключением Telegram WebApp SDK
├── metadata.json             # Метаданные приложения AI Studio
├── package.json              # Зависимости и команды сборки
├── server.ts                 # Полнофункциональный Express-сервер с Vite middleware
├── tsconfig.json             # Настройки компилятора TypeScript
├── vite.config.ts            # Конфигурация сборщика Vite и Tailwind CSS
├── tests/
│   └── run-tests.ts          # Автоматический тестовый набор (18 сценариев)
└── src/
    ├── App.tsx               # Корневой компонент Mini App
    ├── index.css             # Стили Tailwind CSS
    ├── main.tsx              # Инициализация React 19
    ├── assets/images/        # Сгенерированные фото товаров каталога
    ├── core/
    │   ├── types.ts          # Модели данных и типы
    │   ├── errors.ts         # Доменные классы ошибок (404, 403, 409, 422)
    │   └── order-state-machine.ts # Матрица допустимых переходов статусов
    ├── database/
    │   ├── db.ts             # Подключение к БД (node:sqlite) и DDL-схема
    │   └── seed.ts           # Начальные данные (категории, 8 товаров, остатки)
    ├── payments/
    │   ├── types.ts          # Контракт PaymentProvider
    │   ├── mock-provider.ts  # Тестовый шлюз для разработки
    │   ├── yookassa-provider.ts # Интеграция с ЮKassa
    │   ├── telegram-provider.ts # Интеграция с Telegram Payments / Stars
    │   └── payment-service.ts# Сервис платежей и обработка вебхуков
    ├── services/
    │   ├── catalog-service.ts# Управление товарами и категориями
    │   ├── cart-service.ts   # Серверная корзина с пересчетом остатков
    │   ├── order-service.ts  # Оформление заказов и списание остатков
    │   └── admin-service.ts  # Метрики дашборда и настройки магазина
    ├── telegram/
    │   ├── telegram-auth.ts  # Проверка HMAC-SHA256 подписи initData
    │   ├── telegram-bot.ts   # Обработчик команд бота (/start, /orders, /admin)
    │   └── notification-service.ts # Отправка уведомлений клиенту и админу
    └── client/
        ├── api.ts            # Клиентский HTTP-адаптер для вызова API
        ├── telegram.ts       # Обертка над Telegram.WebApp
        ├── components/
        │   ├── Navbar.tsx    # Шапка магазина с корзиной
        │   ├── SimulationBar.tsx # Панель тестирования ролей в браузере
        │   ├── ProductCard.tsx   # Карточка товара в каталоге
        │   ├── ProductDetailModal.tsx # Выбор размера и заказ
        │   ├── CartDrawer.tsx    # Боковая шторка корзины
        │   ├── CheckoutModal.tsx # Форма оформления доставки/самовывоза
        │   ├── MockPaymentModal.tsx # Симулятор тестовой оплаты
        │   └── OrdersView.tsx    # История и отслеживание заказов
        └── admin/
            └── AdminDashboard.tsx# Полноценная панель управления магазином
```

---

## 4. Установка и запуск

### Системные требования:
- Node.js версии **v22.0.0** или новее (используется встроенный модуль `node:sqlite`).
- Менеджер пакетов `npm`.

### 1. Клонирование и установка зависимостей:
```bash
npm install
```

### 2. Настройка переменных окружения:
Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

### 3. Запуск локального сервера разработки:
```bash
npm run dev
```
Сервер запустится на `http://localhost:3000`. При первом запуске автоматически создастся база данных `data/store.db` и наполнятся демонстрационные товары и категории.

### 4. Запуск автоматических тестов:
```bash
npm test
```
Тестовый раннер запустит 18 комплексных тестов на изолированной базе данных в памяти.

### 5. Сборка для production:
```bash
npm run build
npm start
```

---

## 5. Развертывание в Docker (Docker & Docker Compose)

Проект использует надежную стратегию **Node 22 Slim (Debian Bookworm)** с многоэтапной сборкой (Multi-stage build) и **полной предварительной компиляцией бэкенда**:
- **В стадии сборки (`builder`)**: фронтенд компилируется через Vite (`dist/`), а бэкенд на TypeScript компилируется через `esbuild` в единый чистый JavaScript бандл (`dist-server/index.js`).
- **В стадии выполнения (`runner`)**: контейнер запускается на стандартном `node:22-slim` (с нативным `glibc`, без проблем с musl/alpine, без необходимости `tsx` или компилятора TypeScript в памяти), что обеспечивает 100% совместимость со всеми процессорами (x86_64, Apple Silicon M1/M2/M3, ARM64).

### 1. Быстрый запуск через Docker Compose:

Убедитесь, что файл `.env` настроен (или отредактируйте параметры в `docker-compose.yml`), затем выполните одну команду:

```bash
docker compose up -d --build
```

Контейнер автоматически:
- Скомпилирует клиентский SPA и серверный бандл.
- Установит только минимальные production-зависимости (`express`, `dotenv`).
- Подключит директорию `./data` на хосте для сохранения базы данных SQLite.
- Запустит сервер на порту `3000`.

### 2. Проверка работы контейнера:
```bash
# Проверить статус контейнера и healthcheck
docker compose ps

# Просмотр логов в реальном времени
docker compose logs -f shop

# Проверка health-эндпоинта внутри контейнера
curl http://localhost:3000/health
```

### 3. Остановка и перезапуск:
```bash
# Остановка сервиса
docker compose down

# Перезапуск с пересборкой после изменений кода
docker compose up -d --build
```

### 4. Ручная сборка и запуск через чистый Docker (без compose):
```bash
# 1. Сборка образа
docker build -t telegram-shop:latest .

# 2. Запуск контейнера с монтированием базы данных
docker run -d \
  --name telegram_shop \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  telegram-shop:latest
```

### 5. Частые проблемы при сборке Docker и их решение:
- **Ошибка `address already in use 0.0.0.0:3000`**:
  Порт 3000 уже занят другим приложением на компьютере. В файле `.env` или перед запуском укажите свободный порт: `PORT=3005 docker compose up -d --build`.
- **Ошибка `permission denied` при монтировании `./data` на Linux**:
  Выполните на хост-машине: `mkdir -p data && chmod 777 data`.
- **Контейнер падает с ошибкой базы данных**:
  Убедитесь, что volume смонтирован в `/app/data`, а переменная `DATABASE_URL` равна `file:/app/data/store.db`.

### 6. Настройка HTTPS и Reverse Proxy (Nginx) для Telegram Mini App:
Telegram требует, чтобы Mini App открывался строго по безопасному протоколу **HTTPS**. Рекомендуется поставить перед Docker контейнером Nginx или Caddy с бесплатным SSL-сертификатом от Let's Encrypt:

```nginx
server {
    server_name shop.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

После выпуска SSL укажите `https://shop.your-domain.com` в @BotFather через команду `/setmenubutton` и в переменной `TELEGRAM_WEBAPP_URL`.

---

## 6. Переменные окружения (.env)

| Переменная | Описание | Значение по умолчанию |
|---|---|---|
| `DATABASE_URL` | Путь к файлу базы данных SQLite или URL | `file:./data/store.db` |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота из @BotFather | `your_bot_token_here` |
| `TELEGRAM_WEBAPP_URL` | Публичный HTTPS URL приложения | `https://your-domain.com` |
| `ADMIN_TELEGRAM_IDS` | Список Telegram ID администраторов через запятую | `123456789,987654321` |
| `PAYMENT_PROVIDER` | Активный платежный шлюз (`mock`, `yookassa`, `telegram`) | `mock` |
| `PAYMENT_API_KEY` | Идентификатор магазина / API ключ провайдера | `test_api_key_or_shop_id` |
| `PAYMENT_SECRET` | Секретный ключ платежного провайдера | `test_secret_key` |
| `NODE_ENV` | Режим работы (`development` или `production`) | `development` |
| `PORT` | Порт HTTP-сервера | `3000` |

---

## 6. Создание Telegram-бота и настройка Mini App

1. Откройте Telegram и найдите официального бота **[@BotFather](https://t.me/BotFather)**.
2. Отправьте команду `/newbot` и следуйте инструкциям:
   - Введите имя магазина (например, `ATELIER Clothing Store`).
   - Введите username бота (например, `atelier_fashion_store_bot`).
3. Скопируйте полученный **HTTP API Token** и вставьте его в переменную `TELEGRAM_BOT_TOKEN` в файле `.env`.
4. Настройте кнопку меню для открытия Mini App:
   - В @BotFather отправьте `/setmenubutton`.
   - Выберите вашего бота.
   - Укажите URL вашего развернутого приложения (должен быть HTTPS): `https://your-domain.com`.
   - Введите текст для кнопки: `🛍 Открыть магазин`.
5. Дополнительно создайте команду `/newapp` в @BotFather для настройки шортката WebApp при необходимости.

---

## 7. Назначение администратора

1. Узнайте свой Telegram User ID (например, через бота `@userinfobot`).
2. Добавьте свой ID в переменную `ADMIN_TELEGRAM_IDS` в `.env`:
   ```env
   ADMIN_TELEGRAM_IDS="123456789,ваш_id"
   ```
3. Перезапустите сервер. При входе с вашего аккаунта Telegram сервер автоматически присвоит роль `ADMIN`.
4. В браузере (для тестирования) используйте встроенную панель **Telegram Dev Mode** в верхней части экрана, где можно переключаться между покупателем (Александр) и администратором (Константин) в один клик.

---

## 8. Платежные провайдеры

### Тестовый шлюз (MockPaymentProvider)
По умолчанию включен в режиме разработки (`PAYMENT_PROVIDER=mock`). При оформлении заказа открывается модальное окно тестирования с баннером **"TEST PAYMENT"**, позволяющее:
- Протестировать успешное подтверждение оплаты (серверный перевод заказа в `PAID`).
- Протестировать отклонение платежа шлюзом.
- Протестировать повторную отправку дублирующего вебхука с проверкой сохранения идемпотентности.

*Примечание:* В режиме `NODE_ENV=production` тестовый шлюз заблокирован на уровне ядра безопасности.

### Подключение ЮKassa
1. Зарегистрируйтесь в сервисе [ЮKassa](https://yookassa.ru) и получите `shopId` и `Секретный ключ`.
2. Укажите в `.env`:
   ```env
   PAYMENT_PROVIDER="yookassa"
   PAYMENT_API_KEY="ваш_shop_id"
   PAYMENT_SECRET="ваш_секретный_ключ"
   ```
3. В личном кабинете ЮKassa настройте URL для отправки уведомлений (вебхуков):
   ```
   https://your-domain.com/api/payments/webhook?provider=yookassa
   ```
   Выберите событие `payment.succeeded`.

---

## 9. Проверка состояния системы (Health Check)

Приложение предоставляет системный эндпоинт проверки здоровья:
```http
GET /health
```
Пример ответа:
```json
{
  "status": "ok",
  "uptime": 128.45,
  "timestamp": "2026-09-27T21:00:00.000Z",
  "database": "connected",
  "env": "development"
}
```

---

## 10. Устранение неполадок (Troubleshooting)

- **Ошибка: Telegram initData validation failed**:
  - Убедитесь, что токен бота в переменной `TELEGRAM_BOT_TOKEN` точно совпадает с токеном из @BotFather.
  - Если тестирование происходит в веб-браузере вне клиента Telegram, используйте переключатель в панели тестирования.
- **Товар отображается как "Нет в наличии"**:
  - Перейдите в Админ-панель → вкладка "Товары" → нажмите "Изменить" у товара и проверьте остаток по складам вариантов (SKU Stock).
- **Вебхуки не приходят на локальной машине**:
  - Платежные системы требуют публичный HTTPS URL для отправки вебхуков. Воспользуйтесь туннелированием (например, Cloud Run, ngrok, localtunnel) и укажите полученный URL в личном кабинете провайдера.
