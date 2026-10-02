"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyPrefs, readPrefs } from "@/lib/prefs";

/** Держит тему в порядке: применяет настройки и следит за системной темой */
export function PrefsSync() {
  const path = usePathname();
  // Тема зависит и от страницы (Биржа тёмная по умолчанию), поэтому пересчитываем при переходах
  useEffect(() => { applyPrefs(readPrefs()); }, [path]);
  useEffect(() => {
    applyPrefs(readPrefs());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyPrefs(readPrefs());
    mq.addEventListener("change", on);
    window.addEventListener("storage", on);
    return () => { mq.removeEventListener("change", on); window.removeEventListener("storage", on); };
  }, []);
  return null;
}
