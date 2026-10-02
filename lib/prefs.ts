// Настройки интерфейса на этом устройстве: тема, размер текста, анимации, уведомления
import { useEffect, useState } from "react";

export type Prefs = {
  theme: "light" | "dark" | "system" | "warm";
  text: "sm" | "md" | "lg";
  motion: "full" | "reduce";
  popups: boolean;
  sound: boolean;
  showOnline: boolean;
  enterSend: boolean;
};

export const DEFAULT_PREFS: Prefs = { theme: "light", text: "md", motion: "full", popups: true, sound: true, showOnline: true, enterSend: true };
const KEY = "prefs:v1";

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  const dark = p.theme === "dark" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  el.dataset.theme = dark ? "dark" : p.theme === "warm" ? "warm" : "light";
  el.dataset.text = p.text;
  el.dataset.motion = p.motion;
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  applyPrefs(p);
  window.dispatchEvent(new Event("prefs:change"));
}

/** Текущие настройки; обновляются, когда их меняют в Settings */
export function usePrefs() {
  const [p, setP] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const on = () => setP(readPrefs());
    on();
    window.addEventListener("prefs:change", on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener("prefs:change", on); window.removeEventListener("storage", on); };
  }, []);
  return p;
}
