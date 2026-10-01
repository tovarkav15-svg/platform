# Платформа

Сайт: https://tovarkav15-svg.github.io/platform/

Next.js 15 (статичная сборка) + Supabase (аккаунты, база, Realtime).
Выкладка на GitHub Pages: `npm run deploy` (собирает сайт и кладёт его в ветку `gh-pages`).

## Настройка Supabase (один раз)

1. Структура базы: `supabase/migrations/`, применяется командой `supabase db push`.
2. Authentication → Sign In / Providers → Email → выключить **Confirm email**.
3. Project URL и ключ `anon` вписать в `lib/config.ts`.
4. Когда основатели зарегистрируются на сайте, в SQL Editor:
   `update public.profiles set role = 'founder' where username in ('fedonko', 'awiny');`

## Локальный запуск

```
export PATH="$PWD/.node/bin:$PATH"
npm install
npm run dev     # http://localhost:3000
```

## Страницы

- `/register`, `/login` — регистрация и вход по юзернейму или почте
- `/u/?n=username` — профиль; доход видит только владелец (если сам не открыл его всем) — это правило в самой базе
- `/settings/` — аватар, цвет, обложка, имя, юзернейм, описание, ниши, ссылки, доход, смена пароля
- `/friends/` — друзья, заявки, поиск людей
- `/messages/?c=…` — мессенджер, сообщения приходят мгновенно

## Безопасность

Ключ `anon` публичный по задумке Supabase. Кто что может читать и менять, решают правила RLS в `supabase/migrations/`.
Ключ `service_role` и пароль базы в код не попадают никогда.
