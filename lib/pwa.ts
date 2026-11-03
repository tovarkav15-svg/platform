"use client";

import { useEffect, useState } from "react";

// Установка Relic как приложения. Chrome и Edge присылают событие beforeinstallprompt — его надо поймать
// сразу при загрузке и придержать, пока человек не нажмёт «Установить». iPhone такого окна не даёт.
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: PromptEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

export function initPwa(base: string) {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as PromptEvent; ping(); });
  window.addEventListener("appinstalled", () => { deferred = null; ping(); });
  if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }
}

export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () =>
  typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** Можно ли предложить установку и как: системным окном или подсказкой для iPhone */
export function useInstall() {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    setReady(true);
    return () => { subs.delete(f); };
  }, []);
  const installed = ready && isStandalone();
  const mode: "prompt" | "ios" | null = !ready || installed ? null : deferred ? "prompt" : isIos() ? "ios" : null;
  return {
    installed,
    mode,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null; ping();
      return outcome === "accepted";
    },
  };
}
