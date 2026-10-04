"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { Avatar } from "./Avatar";
import { useLive } from "@/lib/live";

type Review = { id: string; author_id: string; target_id: string; rating: number; text: string; created_at: string; author: ProfileCard; deal_id?: string | null };

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" style={{ "--v": value, fontSize: size } as React.CSSProperties} aria-label={`${value} из 5`}>
      <span aria-hidden="true">★★★★★</span><span className="stars-on" aria-hidden="true">★★★★★</span>
    </span>
  );
}

/** Отзывы в профиле: оценка, список и форма. Писать можно тем, с кем была личная переписка */
export function Reviews({ userId, meId, name }: { userId: string; meId: string | null; name: string }) {
  const [list, setList] = useState<Review[] | null>(null);
  const [can, setCan] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("reviews").select(`*, author:profiles!reviews_author_id_fkey(${PROFILE_CARD})`).eq("target_id", userId).order("created_at", { ascending: false });
    const rows = (data as unknown as Review[]) ?? [];
    setList(rows);
    const mine = rows.find((r) => r.author_id === meId);
    if (mine) { setRating(mine.rating); setText(mine.text); }
  }, [userId, meId]);

  useEffect(() => {
    load();
    if (meId && meId !== userId) supabase.rpc("can_review", { p_target: userId }).then(({ data }) => setCan(!!data));
  }, [load, meId, userId]);

  useLive(["reviews"], load);
  const mine = list?.find((r) => r.author_id === meId);
  const avg = list?.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;

  async function save() {
    if (!rating || !meId) return;
    setBusy(true);
    if (mine) await supabase.from("reviews").update({ rating, text: text.trim(), updated_at: new Date().toISOString() }).eq("id", mine.id);
    else await supabase.from("reviews").insert({ target_id: userId, rating, text: text.trim() });
    await load();
    setBusy(false);
  }

  if (list === null) return null;
  const shown = all ? list : list.slice(0, 3);

  return (
    <section className="pf-card rv">
      <header><span className="pf-dot" /><b>Отзывы</b>{list.length > 0 && <span className="rv-avg"><Stars value={avg} /><em className="mono">{avg.toFixed(1)}</em><small>· {list.length}</small></span>}</header>
      {list.length === 0 && <p className="pf-muted">{meId === userId ? "Отзывов пока нет. Попроси клиентов оставить отзыв после работы: это сильнее любого портфолио." : `Об ${name} ещё никто не писал.`}</p>}
      <ul className="rv-list">
        {shown.map((r, i) => (
          <li key={r.id} style={{ "--i": i } as React.CSSProperties}>
            <Link href={profileHref(r.author.username)} className="rv-who"><Avatar name={r.author.display_name} avatar={r.author.avatar} accent={r.author.accent} size={30} /><span><b>{r.author.display_name}</b><small>{new Date(r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small></span></Link>
            <Stars value={r.rating} size={13} />
            {r.deal_id && <span className="rv-deal" title="Отзыв оставлен после закрытой сделки на Бирже">✓ Сделка на Бирже</span>}
            {r.text && <p>{r.text}</p>}
          </li>
        ))}
      </ul>
      {list.length > 3 && <button type="button" className="link-btn" onClick={() => setAll(!all)}>{all ? "Свернуть" : `Все отзывы (${list.length})`}</button>}

      {meId && meId !== userId && (can ? (
        <div className="rv-form">
          <span className="label">{mine ? "Твой отзыв" : "Оставить отзыв"}</span>
          <div className="rv-pick" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={n <= (hover || rating) ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} aria-label={`${n} из 5`}>★</button>
            ))}
          </div>
          <textarea className="bl-in" rows={3} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} placeholder="Как прошла работа: сроки, качество, общение" />
          <div className="save-row">
            <button type="button" className="btn sm" disabled={!rating || busy} onClick={save}>{busy ? "Сохраняю…" : mine ? "Обновить" : "Опубликовать"}</button>
            {mine && <button type="button" className="link-btn" onClick={async () => { await supabase.from("reviews").delete().eq("id", mine.id); setRating(0); setText(""); load(); }}>Удалить</button>}
          </div>
        </div>
      ) : (
        <p className="rv-hint">Отзыв можно оставить после переписки с {name} в чатах, так отзывы остаются честными.</p>
      ))}
    </section>
  );
}

/** Средние оценки для списка людей одним запросом */
export function useRatings(ids: string[]) {
  const [map, setMap] = useState<Record<string, { avg: number; n: number }>>({});
  const key = Array.from(new Set(ids)).sort().join(",");
  useEffect(() => {
    if (!key) return;
    supabase.rpc("rating_of", { p_users: key.split(",") }).then(({ data }) => {
      setMap(Object.fromEntries(((data as { user_id: string; avg: number; n: number }[]) ?? []).map((r) => [r.user_id, { avg: Number(r.avg), n: r.n }])));
    });
  }, [key]);
  return map;
}
