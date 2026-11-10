"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applyPrefs, readPrefs } from "@/lib/prefs";

type TgWebApp = {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  isVersionAtLeast?(v: string): boolean;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(s: "light" | "medium"): void; selectionChanged(): void };
};
const tg = (): TgWebApp | null => (typeof window !== "undefined" ? ((window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null) : null);
export const inTelegram = () => typeof document !== "undefined" && document.documentElement.dataset.tg === "1";

// Цвета шапки Telegram под наш фон: светлый и тёмный (тёмная тема у нас — инверсия страницы)
const BAR = { light: "#fbfbfa", dark: "#181818" };

/** Relic внутри Telegram: на весь экран, кнопка «Назад» Telegram, тема как в Telegram, внешние ссылки — через Telegram */
export function TelegramLayer() {
  const path = usePathname();
  const router = useRouter();
  const depth = useRef(0);
  const [ready, setReady] = useState(false);

  // Запуск: ждём скрипт Telegram, говорим «готово», разворачиваем
  useEffect(() => {
    if (!inTelegram()) return;
    let alive = true;
    let off = () => {};
    const start = (w: TgWebApp) => {
      w.ready();
      w.expand();
      w.disableVerticalSwipes?.();
      setReady(true);
      const paint = () => {
        document.documentElement.dataset.tgscheme = w.colorScheme;
        try { sessionStorage.setItem("tg:scheme", w.colorScheme); } catch {}
        applyPrefs(readPrefs());
        const dark = document.documentElement.dataset.theme === "dark";
        const c = dark ? BAR.dark : BAR.light;
        try { w.setHeaderColor?.(c); w.setBackgroundColor?.(c); w.setBottomBarColor?.(c); } catch {}
      };
      paint();
      w.onEvent("themeChanged", paint);
      window.addEventListener("prefs:change", paint);
      off = () => { w.offEvent("themeChanged", paint); window.removeEventListener("prefs:change", paint); };
    };
    const wait = (n: number) => {
      if (!alive) return;
      const w = tg();
      if (w) start(w); else if (n < 100) setTimeout(() => wait(n + 1), 50);
    };
    wait(0);
    return () => { alive = false; off(); };
  }, []);

  // Кнопка «Назад» в шапке Telegram — когда есть куда возвращаться
  useEffect(() => { if (inTelegram()) depth.current += 1; }, [path]);
  useEffect(() => {
    const w = tg();
    if (!ready || !w) return;
    const back = () => { if (depth.current > 1) { depth.current -= 2; router.back(); } else router.push("/"); };
    if (path === "/" && depth.current <= 1) w.BackButton.hide(); else w.BackButton.show();
    w.BackButton.onClick(back);
    return () => w.BackButton.offClick(back);
  }, [path, router, ready]);

  // Ссылки наружу открываем через Telegram (иначе они откроются внутри и закроют Relic), лёгкая вибрация на кнопках
  useEffect(() => {
    if (!inTelegram()) return;
    const click = (e: MouseEvent) => {
      const w = tg();
      if (!w) return;
      const el = e.target as Element;
      if (el.closest?.("button, .btn, [role=menuitem], [role=tab]")) w.HapticFeedback?.selectionChanged();
      const a = el.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin) return;
      e.preventDefault();
      if (/^(t\.me|telegram\.me)$/.test(url.hostname)) w.openTelegramLink(url.href);
      else w.openLink(url.href);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  return null;
}
