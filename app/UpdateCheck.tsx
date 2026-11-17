"use client";

import { useEffect, useState } from "react";

const BASE = process.env.NODE_ENV === "production" ? "/platform" : "";
const MINE = process.env.NEXT_PUBLIC_BUILD;

/** Открытая вкладка, установленное приложение или Telegram сами подтягивают новую версию сайта.
 *  Вернулся на вкладку и ничего не печатаешь — тихо перезагружаем. Иначе — плашка «Обновить». */
export function UpdateCheck() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!MINE) return;
    let busy = false;
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable);
    };
    async function check(onReturn: boolean) {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
        const { v } = await r.json();
        if (v && v !== MINE) {
          if (onReturn && !typing()) window.location.reload();
          else setFresh(true);
        }
      } catch { /* нет сети — проверим позже */ }
      busy = false;
    }
    const onVis = () => check(true);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => check(false), 3 * 60 * 1000);
    const first = setTimeout(() => check(true), 4000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(id); clearTimeout(first); };
  }, []);
  if (!fresh) return null;
  return (
    <button type="button" className="upd-pill" onClick={() => window.location.reload()}>
      <i aria-hidden="true" />Вышло обновление <b>Обновить</b>
    </button>
  );
}
