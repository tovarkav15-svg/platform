// Relic внутри Telegram: доступ к мини-приложению и серверной функции входа tg-auth
import { supabase } from "./supabase";

export type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string; allows_write_to_pm?: boolean } };
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  isVersionAtLeast?(v: string): boolean;
  requestWriteAccess?(cb?: (ok: boolean) => void): void;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(s: "light" | "medium"): void; notificationOccurred?(t: "success" | "error"): void; selectionChanged(): void };
};

export const BOT_URL = "https://t.me/relicprodbot";

export const tg = (): TgWebApp | null =>
  typeof window !== "undefined" ? ((window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null) : null;

/** Открыто внутри Telegram (флаг ставится до первой отрисовки) */
export const inTelegram = () => typeof document !== "undefined" && document.documentElement.dataset.tg === "1";

/** Данные о человеке, подписанные Telegram; пусто — значит открыто не из Telegram */
export const tgInitData = () => tg()?.initData ?? "";

/** Дождаться скрипта Telegram (он грузится отдельно) */
export function whenTg(): Promise<TgWebApp | null> {
  return new Promise((res) => {
    if (!inTelegram()) return res(null);
    let n = 0;
    const t = () => { const w = tg(); if (w) res(w); else if (++n > 100) res(null); else setTimeout(t, 50); };
    t();
  });
}

type AuthReply = { status?: string; token?: string; first_name?: string; username?: string; error?: string };

export async function tgAuth(mode: "login" | "link" | "signup", extra: Record<string, string> = {}): Promise<AuthReply> {
  const initData = tgInitData();
  if (!initData) return { error: "Открой Relic из бота @relicprodbot" };
  const { data, error } = await supabase.functions.invoke("tg-auth", { body: { mode, initData, ...extra } });
  if (error) {
    // Текст ошибки сервер кладёт в тело ответа
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) return { error: b.error }; } catch {}
    return { error: "Нет связи с сервером. Попробуй ещё раз." };
  }
  return (data as AuthReply) ?? {};
}

/** Войти по одноразовому ключу от сервера */
export async function loginWithToken(token: string) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  return !error;
}
