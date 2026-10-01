// Общие правила для юзернейма: и для формы в браузере, и для сервера
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const RESERVED = new Set([
  "admin", "root", "support", "help", "api", "home", "login", "logout", "register",
  "settings", "learn", "chat", "goals", "calendar", "finance", "marathons", "u", "me",
]);

export function normalizeUsername(raw: string) {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Возвращает текст ошибки или null, если юзернейм подходит */
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN) return `Минимум ${USERNAME_MIN} символа`;
  if (username.length > USERNAME_MAX) return `Максимум ${USERNAME_MAX} символов`;
  if (!/^[a-z0-9._]+$/.test(username)) return "Только латиница, цифры, точка и _";
  if (/^[._]|[._]$/.test(username)) return "Не может начинаться или заканчиваться на . или _";
  if (/[._]{2}/.test(username)) return "Нельзя ставить . или _ подряд";
  if (RESERVED.has(username)) return "Этот юзернейм занят системой";
  return null;
}
