"use client";

import { useEffect, useState } from "react";
import { PUSH_READY } from "@/lib/config";
import { disablePush, enablePush, pushState, syncPush, type PushState } from "@/lib/push";

const HIDE_KEY = "push:banner-hidden";

function usePush() {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt).catch(() => setSt("unsupported")); }, []);
  const run = async (f: () => Promise<PushState>) => {
    setBusy(true);
    try { setSt(await f()); } catch { setSt(await pushState().catch(() => "unsupported" as const)); }
    setBusy(false);
  };
  return { st, busy, on: () => run(enablePush), off: () => run(disablePush) };
}

const IOS_HINT = "На iPhone уведомления приходят только в приложение Relic: открой сайт в Safari → «Поделиться» → «На экран Домой», затем зайди через иконку.";
const DENIED_HINT = "Уведомления запрещены в настройках браузера. Разреши их для этого сайта (значок слева от адреса) и обнови страницу.";

/** Строка в Настройках → Уведомления */
export function PushRow() {
  const { st, busy, on, off } = usePush();
  if (!st || !PUSH_READY) return null;
  if (st === "unsupported") return <p className="st-note">Этот браузер не умеет присылать уведомления. Подойдут Chrome, Edge, Firefox, Safari или приложение Relic на телефоне.</p>;
  if (st === "ios-install") return <p className="st-note">{IOS_HINT}</p>;
  if (st === "denied") return <p className="st-note">{DENIED_HINT}</p>;
  return (
    <label className="st-row">
      <span><b>Уведомления на телефон и компьютер</b><small>{st === "on" ? "Включены на этом устройстве — придут, даже когда сайт закрыт" : "Узнавай о новых сообщениях, даже когда сайт закрыт"}</small></span>
      <input type="checkbox" checked={st === "on"} disabled={busy} onChange={() => (st === "on" ? off() : on())} />
      <span className="pp-switch" aria-hidden="true" />
    </label>
  );
}

/** Мягкая подсказка сверху списка чатов: один раз предлагает включить, можно скрыть */
export function PushBanner() {
  const { st, busy, on } = usePush();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { setHidden(false); }
  }, []);
  // Подписка уже есть — тихо закрепляем её за вошедшим аккаунтом
  useEffect(() => { if (st === "on") syncPush().catch(() => {}); }, [st]);
  const hide = () => { setHidden(true); try { localStorage.setItem(HIDE_KEY, "1"); } catch {} };
  if (hidden || !st || st === "on" || st === "unsupported" || st === "denied") return null;
  return (
    <div className="push-banner" role="status">
      <span className="push-banner-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10z" /><path d="M10 19.5a2 2 0 0 0 4 0" /></svg>
      </span>
      <span className="push-banner-t">
        <b>Не пропускай сообщения</b>
        <small>{st === "ios-install" ? IOS_HINT : "Включи уведомления — придут, даже когда сайт закрыт."}</small>
      </span>
      {st === "off" && <button type="button" className="btn sm" disabled={busy} onClick={on}>Включить</button>}
      <button type="button" className="push-banner-x" onClick={hide} aria-label="Скрыть подсказку">×</button>
    </div>
  );
}
