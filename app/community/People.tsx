"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { useFriendLinks } from "@/lib/useFriendLinks";
import { NICHES } from "@/lib/niches";
import { normalizeUsername } from "@/lib/username";
import { profileHref } from "@/lib/links";
import { useDecos } from "@/lib/shop";
import { Avatar } from "../Avatar";
import { FriendActions } from "../FriendActions";
import { CountUp } from "../CountUp";
import { Grid } from "../people/PersonCard";
import { useLive } from "@/lib/live";

const SKILLS = ["Premiere Pro", "After Effects", "Figma", "Reels", "Telegram", "Next.js", "Midjourney", "Таргет", "Копирайтинг"];

export function People() {
  const { me } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const niche = sp.get("niche") ?? "";
  const open = sp.get("open") === "1";
  const fl = useFriendLinks(me?.id);
  const [found, setFound] = useState<ProfileCard[] | null>(null);
  const [pool, setPool] = useState<{ niches: string; open_to_work: boolean }[]>([]);
  const [draft, setDraft] = useState(q);
  const filtered = !!(q || niche || open);

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(niche && { niche }), ...(open && { open: "1" }) });
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    const qs = p.toString();
    router.replace(`/community/?tab=people${qs ? `&${qs}` : ""}`, { scroll: false });
  };

  useEffect(() => { setDraft(q); }, [q]);

  // Поиск прямо при вводе, без кнопки
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const type = (v: string) => {
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() }), 320);
  };

  // Сколько людей в каждой нише — для плиток «Кого ищешь»
  const [tick, setTick] = useState(0);
  useLive(["profiles", "friendships"], () => { setTick((t) => t + 1); fl.reload(); });
  useEffect(() => {
    supabase.from("profiles").select("niches, open_to_work").eq("discoverable", true).limit(2000).then(({ data }) => setPool((data as typeof pool) ?? []));
  }, [tick]);
  // Скелетон только при смене фильтров, живые обновления подменяют список тихо
  useEffect(() => { setFound(null); }, [q, niche, open]);

  useEffect(() => {
    if (!me) { setFound([]); return; }
    let query = supabase.from("profiles").select(PROFILE_CARD).neq("id", me.id).eq("discoverable", true).order("created_at", { ascending: false }).limit(90);
    if (q) {
      const safe = q.replace(/[%,()*]/g, "");
      query = query.or(`username.ilike.%${normalizeUsername(safe)}%,display_name.ilike.%${safe}%,headline.ilike.%${safe}%,skills.ilike.%${safe}%`);
    }
    if (niche) query = query.ilike("niches", `%${niche}%`);
    if (open) query = query.eq("open_to_work", true);
    query.then(({ data }) => setFound((data as ProfileCard[]) ?? []));
  }, [me, q, niche, open, tick]);

  const decos = useDecos((found ?? []).map((p) => p.id));
  const myNiches = useMemo(() => new Set((me?.niches ?? "").split(",").filter(Boolean)), [me]);
  const people = found ?? [];
  const openNow = people.filter((p) => p.open_to_work);
  const close = people.filter((p) => p.niches.split(",").some((n) => myNiches.has(n)) && !openNow.includes(p)).slice(0, 8);
  const count = (id: string) => pool.filter((p) => p.niches.split(",").includes(id)).length;

  return (
    <div className="pp cm-pane">
        <header className="pp-head cm-sub">
          <div>
            <p className="pp-sub">Здесь все участники. Найди монтажёра, дизайнера или продюсера, добавь в друзья, напиши в чат или позови в проект.</p>
          </div>
          <dl className="dv-stats">
            <div><dt>людей</dt><dd className="mono"><CountUp value={pool.length} /></dd></div>
            <div><dt>открыты к работе</dt><dd className="mono"><CountUp value={pool.filter((p) => p.open_to_work).length} /></dd></div>
            <div><dt>твоих друзей</dt><dd className="mono"><CountUp value={fl.friends.length} /></dd></div>
          </dl>
        </header>

        {fl.incoming.length > 0 && (
          <section className="pp-requests">
            <b>{fl.incoming.length === 1 ? "Тебя хотят добавить в друзья" : `${fl.incoming.length} заявки в друзья`}</b>
            <div className="pp-req-list">
              {fl.incoming.slice(0, 4).map((p) => (
                <div key={p.id} className="pp-req">
                  <Link href={profileHref(p.username)} className="pp-req-who"><Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={32} userId={p.id} /><span><b>{p.display_name}</b><small>@{p.username}</small></span></Link>
                  <FriendActions userId={p.id} state="incoming" compact onChange={fl.reload} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="pp-search">
          <div className="pp-input">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input value={draft} onChange={(e) => type(e.target.value)} placeholder="Имя, @юзернейм или навык" aria-label="Поиск людей" autoComplete="off" />
            {draft && <button type="button" className="pp-clear" aria-label="Очистить" onClick={() => { setDraft(""); go({ q: "" }); }}>×</button>}
          </div>
          <div className="pp-skills">
            <span>Часто ищут:</span>
            {SKILLS.map((s) => <button key={s} type="button" className={`pp-skill ${q === s ? "on" : ""}`} onClick={() => go({ q: q === s ? "" : s })}>{s}</button>)}
          </div>
        </section>

        <section>
          <div className="dv-sec-head"><h2>Кого ищешь?</h2><span>Нажми на нишу, чтобы увидеть людей в ней</span></div>
          <div className="pp-niches">
            {NICHES.map((n, i) => (
              <button key={n.id} type="button" className={`pp-niche ${niche === n.id ? "on" : ""}`} style={{ "--c": n.color, "--i": i } as React.CSSProperties} onClick={() => go({ niche: niche === n.id ? "" : n.id })}>
                <i aria-hidden="true" />
                <b>{n.title}</b>
                <small>{count(n.id)} {plural(count(n.id))}</small>
              </button>
            ))}
          </div>
          <label className="pp-open">
            <input type="checkbox" checked={open} onChange={() => go({ open: open ? "" : "1" })} />
            <span className="pp-switch" aria-hidden="true" />
            Только те, кто открыт к работе
          </label>
        </section>

        {!me ? (
          <div className="pf-empty"><p className="lead">Войди, чтобы искать людей, добавлять в друзья и писать им.</p><Link className="btn" href="/login">Войти</Link></div>
        ) : found === null || !fl.loaded ? (
          <div className="pp-grid">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="skeleton pp-ph" />)}</div>
        ) : filtered ? (
          <section>
            <div className="dv-sec-head">
              <h2>{people.length ? `Нашлось ${people.length}` : "Никого не нашли"}</h2>
              <button type="button" className="link-btn" onClick={() => router.replace("/community/?tab=people", { scroll: false })}>Сбросить фильтры</button>
            </div>
            {people.length
              ? <Grid people={people} decos={decos} stateOf={fl.stateOf} reload={fl.reload} />
              : <p className="pp-none">Попробуй другое имя или навык, или убери фильтры.</p>}
          </section>
        ) : (
          <>
            {openNow.length > 0 && (
              <section>
                <div className="dv-sec-head"><h2>Открыты к работе</h2><span>Можно звать в проект прямо сейчас</span></div>
                <Grid people={openNow.slice(0, 8)} decos={decos} stateOf={fl.stateOf} reload={fl.reload} />
              </section>
            )}
            {close.length > 0 && (
              <section>
                <div className="dv-sec-head"><h2>Из твоих ниш</h2><span>Те, кто занимается тем же, что и ты</span></div>
                <Grid people={close} decos={decos} stateOf={fl.stateOf} reload={fl.reload} />
              </section>
            )}
            <section>
              <div className="dv-sec-head"><h2>Все люди</h2><span>Новые сверху</span></div>
              {people.length ? <Grid people={people} decos={decos} stateOf={fl.stateOf} reload={fl.reload} /> : <p className="pp-none">Пока здесь только ты. Позови друзей на платформу.</p>}
            </section>
          </>
        )}
    </div>
  );
}

const plural = (n: number) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "человек";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "человека";
  return "человек";
};
