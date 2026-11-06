"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { initPwa, useInstall } from "@/lib/pwa";

const BASE = process.env.NODE_ENV === "production" ? "/platform" : "";

let started = false;
/** Подключает помощника приложения и ловит предложение установки. Стоит один раз в layout */
export function PwaLayer() {
  useEffect(() => { if (!started) { started = true; initPwa(BASE); } }, []);
  // Цвет полосы окна установленного приложения — в тон теме, иначе на тёмной теме сверху белая полоса
  useEffect(() => {
    const html = document.documentElement;
    const paint = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta) meta.content = html.dataset.theme === "dark" ? "#0b0b0c" : html.dataset.theme === "warm" ? "#f7f1e6" : "#d8d2c6";
    };
    paint();
    const mo = new MutationObserver(paint);
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return null;
}

/** Кнопка «Установить приложение»: системное окно в Chrome/Edge, подсказка на iPhone. Если ставить нечего — пусто */
export function InstallButton({ className = "", children, onDone }: { className?: string; children?: React.ReactNode; onDone?: () => void }) {
  const { mode, install } = useInstall();
  const [ios, setIos] = useState(false);
  if (!mode) return null;
  return (
    <>
      <button type="button" className={className} onClick={async () => {
        if (mode === "ios") setIos(true);
        else { await install(); onDone?.(); }
      }}>{children ?? "Установить приложение"}</button>
      {ios && createPortal(<IosSheet onClose={() => { setIos(false); onDone?.(); }} />, document.body)}
    </>
  );
}

function IosSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="ia-shade" onClick={onClose}>
      <div className="ia-sheet" role="dialog" aria-modal="true" aria-label="Как установить Relic" onClick={(e) => e.stopPropagation()}>
        <img src={`${BASE}/app/icon-192.png`} alt="" width={64} height={64} />
        <b>Relic на экран «Домой»</b>
        <ol>
          <li>
            <span>Нажми <svg viewBox="0 0 24 24" width="20" height="20" aria-label="Поделиться"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg> «Поделиться» внизу Safari</span>
          </li>
          <li><span>Пролистай и выбери <b>«На экран Домой»</b></span></li>
          <li><span>Нажми <b>«Добавить»</b> — иконка Relic появится рядом с приложениями</span></li>
        </ol>
        <small>Работает в Safari. Если открыл Relic в Telegram или другом приложении, сначала открой ссылку в Safari.</small>
        <button type="button" className="btn" onClick={onClose}>Понятно</button>
      </div>
    </div>
  );
}
