# Подключение Supabase

Сайт получает только опубликованные проекты через `/api/projects`. Управление записями выполняется в Supabase Dashboard. Supabase SDK и секретный `service_role` не нужны.

## 1. Создать проект Supabase

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard) и создайте проект.
2. Дождитесь запуска базы данных.
3. Откройте **SQL Editor** → **New query**.
4. Скопируйте туда весь файл `supabase/schema.sql` и нажмите **Run**.

Скрипт создаст таблицу `projects`, включит RLS и разрешит анонимным посетителям читать только строки с `published = true`.

## 2. Добавить проекты

Откройте **Table Editor** → `projects` → **Insert row**.

- `title` — название проекта, обязательно.
- `category` — категория, обязательно.
- `live_url` — полная ссылка вида `https://example.com`; необязательное поле.
- `image_url` — прямая публичная HTTPS-ссылка на обложку; необязательное поле.
- `sort_order` — порядок карточек: меньшее число показывается раньше.
- `published` — включите, чтобы проект появился на сайте.

Для обложек можно создать в **Storage** публичный bucket `portfolio`, загрузить файл и вставить его **Public URL** в `image_url`. Пустые необязательные поля оставляйте как `NULL`.

## 3. Взять параметры подключения

В Supabase откройте **Project Settings** → **API Keys**:

- URL проекта сохраните как `SUPABASE_URL` — формат `https://PROJECT_REF.supabase.co`.
- **Publishable key** вида `sb_publishable_...` сохраните как `SUPABASE_PUBLISHABLE_KEY`.

Не используйте `Secret key`, `service_role`, пароль базы или connection string. Они дают лишние права и этому сайту не нужны.

## 4. Добавить переменные в Vercel

После импорта GitHub-репозитория в Vercel откройте **Project** → **Settings** → **Environment Variables** и добавьте:

```text
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Отметьте `Production`, `Preview` и `Development`. После сохранения запустите новый deployment: старые deployments новые переменные не получают.

## 5. Проверить

1. Откройте `https://ВАШ-ДОМЕН/api/projects` — должен вернуться JSON-массив опубликованных проектов.
2. Откройте сайт и проверьте секцию «Портфолио».
3. Снимите `published` у тестовой записи: после обновления страницы карточка должна исчезнуть.

Если `/api/projects` отвечает `500`, проверьте обе переменные Vercel. Если отвечает `502`, проверьте URL, ключ, выполнение `schema.sql` и RLS policy.
