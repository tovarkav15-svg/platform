// Статичный сайт: вместо /u/fedonko используем /u/?n=fedonko
export const profileHref = (username: string) => `/u/?n=${encodeURIComponent(username)}`;
export const chatHref = (chatId: string) => `/messages/?c=${encodeURIComponent(chatId)}`;
