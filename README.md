# Платформа

Next.js 15 + Prisma (SQLite локально, Postgres на сервере).

## Запуск

```
export PATH="$PWD/.node/bin:$PATH"
npm install
npm run setup   # создаёт базу и тестовый аккаунт @fedonko (данные в prisma/seed.mjs)
npm run dev     # http://localhost:3000
```

## Страницы

- `/register` — регистрация (имя, юзернейм с живой проверкой, почта, пароль, ниши)
- `/login` — вход по юзернейму или почте
- `/u/[username]` — профиль; блок дохода видит только владелец
