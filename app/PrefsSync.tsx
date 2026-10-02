"use client";

import { useEffect } from "react";
import { applyPrefs, readPrefs } from "@/lib/prefs";

/** Держит тему в порядке: применяет настройки и следит за системной темой */
export function PrefsSync() {
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
