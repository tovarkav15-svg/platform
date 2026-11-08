// Подключение к Supabase. Ключ publishable публичный по задумке Supabase:
// доступ к данным ограничивают правила (RLS) в supabase/migrations.
export const SUPABASE_URL = "https://wrmohfypaprsurkgfcii.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_u5viLmG4js2A70n3_L2yZg_nHDTnIlD";

// Технический домен для адресов аккаунтов (вход идёт по юзернейму)
export const AUTH_EMAIL_DOMAIN = "users.platforma.app";

// Публичный ключ уведомлений на телефон (Web Push). Секретная пара хранится только на сервере (функция push)
export const VAPID_PUBLIC = "BNW4l9pHBxnGxvJAv-txq2b-5Z509SMB3mlDZfJSA20-BMqRbmCUocFvbUgd8IU0MxY1zMMkqOe1vYR890zxGMA";
// Включается, когда серверная часть уведомлений (миграция push, функция push, ключи) выложена
export const PUSH_READY = true;
