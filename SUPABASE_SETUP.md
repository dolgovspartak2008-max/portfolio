# Подключение Supabase

Сайт получает только опубликованные проекты через `/api/projects`. Управление записями выполняется в Supabase Dashboard или через Telegram-бота. Supabase SDK не нужен.

## 1. Создать проект Supabase

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard) и создайте проект.
2. Дождитесь запуска базы данных.
3. Откройте **SQL Editor** → **New query**.
4. Скопируйте туда весь файл `supabase/schema.sql` и нажмите **Run**.

Скрипт создаст таблицу `projects`, публичный Storage bucket `portfolio`, включит RLS и разрешит анонимным посетителям читать только строки с `published = true`.

## 2. Добавить проекты

Откройте **Table Editor** → `projects` → **Insert row**.

- `title` — название проекта, обязательно.
- `category` — категория, обязательно.
- `live_url` — полная ссылка вида `https://example.com`; необязательное поле.
- `image_url` — прямая публичная HTTPS-ссылка на обложку; необязательное поле.
- `sort_order` — порядок карточек: меньшее число показывается раньше.
- `published` — включите, чтобы проект появился на сайте.

На сайте показываются первые 12 работ, остальные — по кнопке «Показать ещё»; есть поиск по названию и категории. Количество работ не ограничено.

## 3. Взять параметры подключения

В Supabase откройте **Project Settings** → **API Keys**:

- URL проекта сохраните как `SUPABASE_URL` — формат `https://PROJECT_REF.supabase.co`.
- **Publishable key** вида `sb_publishable_...` сохраните как `SUPABASE_PUBLISHABLE_KEY`.

## 4. Добавить переменные в Vercel

Откройте **Project** → **Settings** → **Environment Variables** и добавьте:

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Отметьте `Production`, `Preview` и `Development`. После сохранения запустите новый deployment (**Redeploy**): старые deployments новые переменные не получают.

## 5. Проверить

1. Откройте `https://ВАШ-ДОМЕН/api/projects` — должен вернуться JSON-массив опубликованных проектов.
2. Если `/api/projects` отвечает `500` — проверьте обе переменные Vercel. Если `502` — URL, ключ, выполнение `schema.sql` и RLS policy.

## Управление работами через Telegram-бота

Добавьте в Vercel ещё четыре переменные:

```text
TELEGRAM_BOT_TOKEN=токен от BotFather
TELEGRAM_ADMIN_ID=ваш ЧИСЛОВОЙ Telegram ID (не @username)
TELEGRAM_WEBHOOK_SECRET=длинная строка только из латиницы, цифр, _ и -
SUPABASE_SECRET_KEY=sb_secret_... ключ Supabase
```

После **Redeploy**:

1. Откройте `https://ВАШ-ДОМЕН/api/telegram?setup=ВАШ_TELEGRAM_WEBHOOK_SECRET` — бот сам зарегистрирует webhook на этот домен.
2. Откройте `https://ВАШ-ДОМЕН/api/telegram` — страница покажет, что не так: какие переменные не заданы, принят ли токен, куда смотрит webhook и последнюю ошибку доставки. Если всё в порядке — `"ok": true`.
3. Напишите боту `/list`. Если ID в `TELEGRAM_ADMIN_ID` не ваш, бот ответит «Нет доступа» и пришлёт ваш настоящий ID.

Команды бота:

```text
/list
/add Название | Категория | https://сайт | https://обложка | порядок
/image ID   — отправить фото с этой подписью
/publish ID
/hide ID
/delete ID CONFIRM
```

Новая работа после `/add` создаётся скрытой. Опубликуйте её командой `/publish ID`.
Чтобы заменить обложку, отправьте боту фотографию с подписью `/image ID`.
