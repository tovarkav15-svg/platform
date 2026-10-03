"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { useLive } from "@/lib/live";
import { Avatar } from "../Avatar";

type Ref = { username: string; display_name: string; avatar: string | null; accent: string; aura: number; coins: number | null; n: number | null; joined: string };
// Совпадает с ref_coins в базе
const STEPS = [
  { from: 1, to: 5, coins: 25 },
  { from: 6, to: 10, coins: 50 },
  { from: 11, to: 25, coins: 75 },
  { from: 26, to: null, coins: 100 },
];
const NEED = 50;
const coinsFor = (n: number) => STEPS.find((s) => n >= s.from && (s.to === null || n <= s.to))!.coins;

/** Приглашай друзей: ссылка, прогресс по ступеням наград и список приглашённых */
export function Referrals({ me }: { me: Profile | null }) {
  const [list, setList] = useState<Ref[] | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase.rpc("my_referrals");
    setList((data as Ref[]) ?? []);
  }, [me]);
  useEffect(() => { load(); }, [load]);
  useLive(["profiles"], load, { enabled: !!me, poll: 60000 });

  const base = typeof window === "undefined" ? "" : `${window.location.origin}${process.env.NODE_ENV === "production" ? "/platform" : ""}`;
  const link = me ? `${base}/register/?ref=${me.username}` : "";
  const counted = (list ?? []).filter((r) => r.coins !== null);
  const pending = (list ?? []).filter((r) => r.coins === null);
  const earned = counted.reduce((s, r) => s + (r.coins ?? 0), 0);
  const next = counted.length + 1;
  const share = `Залетай в Relic — платформу для фрилансеров: профиль, биржа заказов, обучение и люди твоей ниши. ${link}`;

  return (
    <section className="rf">
      <div className="rf-head">
        <span className="rf-gift" aria-hidden="true">🎁</span>
        <div>
          <b>Приглашай друзей — получай Coins</b>
          <p>Друг регистрируется по твоей ссылке и набирает {NEED} AURA (заполняет профиль, добавляет работу) — тебе приходят Coins. Чем больше друзей привёл, тем дороже каждый следующий.</p>
        </div>
      </div>

      <ol className="rf-steps">
        {STEPS.map((s) => {
          const active = next >= s.from && (s.to === null || next <= s.to);
          const done = s.to !== null && counted.length >= s.to;
          return (
            <li key={s.from} className={`${active ? "on" : ""} ${done ? "done" : ""}`}>
              <span className="mono">+{s.coins}</span>
              <small>{s.to ? `${s.from}–${s.to}-й друг` : `${s.from}-й и дальше`}</small>
            </li>
          );
        })}
      </ol>

      {me ? (
        <>
          <div className="rf-link">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Твоя ссылка-приглашение" />
            <button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? "Скопировано ✓" : "Скопировать"}</button>
            <a className="btn ghost sm" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(share.replace(link, "").trim())}`} target="_blank" rel="noopener noreferrer">Telegram</a>
          </div>
          <div className="rf-stats">
            <div><b className="mono">{counted.length}</b><small>друзей засчитано</small></div>
            <div><b className="mono">{pending.length}</b><small>набирают {NEED} AURA</small></div>
            <div><b className="mono">{earned}</b><small>Coins получено</small></div>
            <div className="hot"><b className="mono">+{coinsFor(next)}</b><small>за следующего друга</small></div>
          </div>
          {list && list.length > 0 && (
            <ul className="rf-list">
              {list.map((r) => (
                <li key={r.username}>
                  <Link href={profileHref(r.username)} className="rf-who"><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={32} /><span><b>{r.display_name}</b><small>@{r.username}</small></span></Link>
                  {r.coins !== null
                    ? <span className="rf-ok">✓ +{r.coins} Coins</span>
                    : <span className="rf-wait"><i style={{ width: `${Math.min(100, (r.aura / NEED) * 100)}%` }} /><em>{r.aura}/{NEED} AURA</em></span>}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="rf-hint"><Link href="/register">Зарегистрируйся</Link>, чтобы получить свою ссылку-приглашение.</p>
      )}
    </section>
  );
}
