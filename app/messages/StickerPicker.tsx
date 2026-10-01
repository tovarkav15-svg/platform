"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { PACKS, StickerArt } from "@/lib/stickers";
import { PREMIUM_AURA } from "@/lib/aura";

let auraCache: { id: string; v: number } | null = null;

export function useMyAura() {
  const { me } = useSession();
  const [aura, setAura] = useState<number | null>(auraCache && me && auraCache.id === me.id ? auraCache.v : null);
  useEffect(() => {
    if (!me) return;
    supabase.rpc("my_aura", { p_user: me.id }).then(({ data }) => { const v = (data as number) ?? 0; auraCache = { id: me.id, v }; setAura(v); });
  }, [me]);
  return aura;
}

/** Панель стикеров: бесплатные паки всем, премиум — с уровня «Сияние» */
export function StickerPicker({ onPick, onClose }: { onPick: (code: string) => void; onClose: () => void }) {
  const { me } = useSession();
  const aura = useMyAura();
  const [pack, setPack] = useState(PACKS[0].id);
  const box = useRef<HTMLDivElement>(null);
  const unlocked = !!me && (me.role === "owner" || me.is_support || (aura ?? 0) >= PREMIUM_AURA);
  const cur = PACKS.find((p) => p.id === pack)!;
  const locked = cur.premium && !unlocked;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return (
    <div className="stk-pop" ref={box}>
      <div className="stk-tabs">
        {PACKS.map((p) => (
          <button key={p.id} type="button" className={pack === p.id ? "on" : ""} onClick={() => setPack(p.id)} title={p.title}>
            <StickerArt code={`${p.id}:${p.cover}`} size={30} />
            {p.premium && <i className="stk-star">★</i>}
          </button>
        ))}
      </div>
      <div className="stk-head">
        <b>{cur.title}</b>
        {cur.premium && <span className="stk-premium">Premium</span>}
      </div>
      <div className={`stk-grid ${locked ? "locked" : ""}`} key={pack}>
        {cur.stickers.map((s, i) => (
          <button key={s.id} type="button" style={{ "--i": i } as React.CSSProperties} disabled={locked} onClick={() => onPick(`${cur.id}:${s.id}`)} title={s.title}>
            <StickerArt code={`${cur.id}:${s.id}`} size={64} />
          </button>
        ))}
        {locked && (
          <div className="stk-lock">
            <b>Откроется с уровня «Сияние»</b>
            <span>Нужно {PREMIUM_AURA} AURA, у тебя {aura ?? "…"}. Получай AURA за работы, проекты, цели и активность.</span>
            <Link href="/aura/" className="btn sm">Как получить AURA</Link>
          </div>
        )}
      </div>
    </div>
  );
}
