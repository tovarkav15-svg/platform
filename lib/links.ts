// Статичный сайт: вместо /u/fedonko используем /u/?n=fedonko
export const profileHref = (username: string, tab?: string) =>
  `/u/?n=${encodeURIComponent(username)}${tab ? `&tab=${tab}` : ""}`;
export const chatHref = (chatId: string) => `/messages/?c=${encodeURIComponent(chatId)}`;
export const projectHref = (id: string) => `/project/?id=${encodeURIComponent(id)}`;
