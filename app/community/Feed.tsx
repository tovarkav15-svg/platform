"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase, publicMedia, PROFILE_CARD, STAGES, type Project, type ProfileCard, type Work } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { profileHref, projectHref } from "@/lib/links";
import { Avatar } from "../Avatar";
import { CountUp } from "../CountUp";

type Kind = "all" | "projects" | "work" | "looking";
type Item =
  | { type: "project"; at: string; project: Project; author: ProfileCard }
  | { type: "work"; at: string; work: Work; author: ProfileCard };

const KINDS: { id: Kind; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "projects", label: "Проекты" },
  { id: "work", label: "Proof of Work" },
  { id: "looking", label: "Ищут людей" },
];

const nicheOf = (it: Item) => NICHES.find((n) => n.id === (it.type === "project" ? it.project.niche : it.work.niche));
const weekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();
const keyOf = (it: Item) => `${it.type}-${it.type === "project" ? it.project.id : it.work.id}`;
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} дн назад` : new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

export function Feed() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [niche, setNiche] = useState("");


  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [p, w] = await Promise.all([
        supabase.from("projects").select(`*, author:profiles!projects_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(80),
        supabase.from("works").select(`*, author:profiles!works_user_id_fkey(${PROFILE_CARD})`).order("created_at", { ascending: false }).limit(80),
      ]);
      setItems([
        ...((p.data as unknown as (Project & { author: ProfileCard })[]) ?? []).map(({ author, ...project }) => ({ type: "project" as const, at: project.updated_at, project, author })),
        ...((w.data as unknown as (Work & { author: ProfileCard })[]) ?? []).map(({ author, ...work }) => ({ type: "work" as const, at: work.created_at, work, author })),
      ].sort((a, b) => b.at.localeCompare(a.at)));
    })();
  }, [ready]);

  const all = items ?? [];
  const byKind = (k: Kind) => all.filter((it) => k === "all" || (k === "projects" && it.type === "project") || (k === "work" && it.type === "work") || (k === "looking" && it.type === "project" && !!it.project.looking_for));
  const view = useMemo(() => byKind(kind).filter((it) => !niche || nicheOf(it)?.id === niche), [items, kind, niche]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = view[0];
  const rest = view.slice(1);
  const looking = all.filter((it): it is Extract<Item, { type: "project" }> => it.type === "project" && !!it.project.looking_for && (!niche || it.project.niche === niche)).slice(0, 8);
  const fresh = all.filter((it) => it.at > weekAgo()).length;
  const authors = new Set(all.map((it) => it.author.id)).size;

  // Подсветка фильтра едет за выбранным, как в Workspace, только по горизонтали
  const bar = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current?.querySelector<HTMLElement>(`[data-k="${kind}"]`);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [kind, items]);

  const hour = new Date().getHours();
  const part = hour < 5 ? "ночь" : hour < 12 ? "утро" : hour < 18 ? "день" : "вечер";

  return (
    <div className="dv cm-pane">
        <header className="dv-head cm-sub">
          <div className="dv-head-l">
            <span className="label">{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })} · {part}</span>
            <p className="dv-sub">Что строят и что уже сделали люди платформы. Свежее сверху.</p>
          </div>
          <dl className="dv-stats">
            <div><dt>за неделю</dt><dd className="mono"><CountUp value={fresh} /></dd></div>
            <div><dt>проектов</dt><dd className="mono"><CountUp value={all.filter((i) => i.type === "project").length} /></dd></div>
            <div><dt>работ</dt><dd className="mono"><CountUp value={all.filter((i) => i.type === "work").length} /></dd></div>
            <div><dt>авторов</dt><dd className="mono"><CountUp value={authors} /></dd></div>
          </dl>
        </header>

        <div className="dv-controls">
          <div className="dv-kinds" ref={bar} role="tablist">
            {pill && <span className="dv-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />}
            {KINDS.map((k) => (
              <button key={k.id} type="button" role="tab" data-k={k.id} aria-selected={kind === k.id} className="dv-kind" onClick={() => setKind(k.id)}>
                {k.label}<em className="mono">{items ? byKind(k.id).length : "·"}</em>
              </button>
            ))}
          </div>
          <div className="dv-niches">
            <button type="button" className={`dv-niche ${!niche ? "on" : ""}`} onClick={() => setNiche("")}>Все ниши</button>
            {NICHES.map((n) => {
              const c = byKind(kind).filter((it) => nicheOf(it)?.id === n.id).length;
              return (
                <button key={n.id} type="button" className={`dv-niche ${niche === n.id ? "on" : ""} ${c ? "" : "zero"}`} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>
                  <i />{n.title}
                </button>
              );
            })}
          </div>
        </div>

        {items === null ? (
          <div className="dv-skel"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        ) : view.length === 0 ? (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{all.length ? "Здесь пусто. Выбери другую нишу или раздел." : "Лента пока пустая. Добавь проект или работу в профиль, и они появятся здесь."}</p>
            {me && <Link className="btn" href={profileHref(me.username, "projects")}>Добавить</Link>}
          </div>
        ) : (
          <div className="dv-flow" key={`${kind}-${niche}`}>
            {focus && <Focus it={focus} />}

            {looking.length > 0 && kind !== "work" && (
              <section className="dv-calls">
                <div className="dv-sec-head"><h2>Ищут людей</h2><span>Проекты, которым нужна помощь прямо сейчас</span></div>
                <div className="dv-calls-row">
                  {looking.map((g, i) => {
                    const n = NICHES.find((x) => x.id === g.project.niche);
                    return (
                      <Link key={g.project.id} href={projectHref(g.project.id)} className="dv-call" style={{ "--c": n?.color ?? "#141414", "--i": i } as React.CSSProperties}>
                        <span className="dv-call-who"><Avatar name={g.author.display_name} avatar={g.author.avatar} accent={g.author.accent} size={26} userId={g.author.id} /><b>{g.project.name}</b></span>
                        <span className="dv-call-need">{g.project.looking_for}</span>
                        <span className="dv-call-go">Откликнуться <em>→</em></span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {rest.length > 0 && (
              <section>
                <div className="dv-sec-head"><h2>Лента</h2><span>{rest.length} публикаций</span></div>
                <div className="dv-mosaic">
                  {rest.map((it, i) => <Tile key={keyOf(it)} it={it} i={i} />)}
                </div>
              </section>
            )}
          </div>
        )}

        {me && <Link className="dv-fab" href={profileHref(me.username, "projects")}>+ Показать своё</Link>}
    </div>
  );
}

function href(it: Item) {
  return it.type === "project" ? { href: projectHref(it.project.id), ext: false } : it.work.link ? { href: it.work.link, ext: true } : { href: profileHref(it.author.username, "work"), ext: false };
}

function Go({ it, className, style, children }: { it: Item; className: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const h = href(it);
  return h.ext
    ? <a className={className} style={style} href={h.href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
    : <Link className={className} style={style} href={h.href}>{children}</Link>;
}

function Author({ it }: { it: Item }) {
  return (
    <span className="dv-author">
      <Avatar name={it.author.display_name} avatar={it.author.avatar} accent={it.author.accent} size={24} userId={it.author.id} />
      <b>{it.author.display_name}</b><small>{ago(it.at)}</small>
    </span>
  );
}

/** Главный материал: самая свежая публикация на всю ширину */
function Focus({ it }: { it: Item }) {
  const n = nicheOf(it);
  const img = publicMedia(it.type === "project" ? it.project.image_path : it.work.image_path);
  const title = it.type === "project" ? it.project.name : it.work.title;
  const text = it.type === "project" ? it.project.tagline || it.project.description : it.work.description;
  return (
    <Go it={it} className="dv-focus" style={{ "--c": n?.color ?? "#7B61FF" } as React.CSSProperties}>
      <span className="dv-focus-media">
        {img ? <img src={img} alt="" /> : <span className="dv-glyph">{title.slice(0, 1)}</span>}
      </span>
      <span className="dv-focus-text">
        <span className="dv-kicker"><i />{it.type === "project" ? `Проект · ${STAGES[it.project.stage]}` : "Proof of Work"}{n && ` · ${n.title}`}</span>
        <b className="dv-focus-title">{title}</b>
        {it.type === "work" && it.work.result && <span className="dv-result mono">{it.work.result}</span>}
        {text && <span className="dv-focus-desc">{text}</span>}
        <span className="dv-focus-foot"><Author it={it} /><em className="dv-open">Открыть <i>→</i></em></span>
      </span>
    </Go>
  );
}

/** Карточка мозаики: с картинкой — фото с подписью, без — крупный текст */
function Tile({ it, i }: { it: Item; i: number }) {
  const n = nicheOf(it);
  const img = publicMedia(it.type === "project" ? it.project.image_path : it.work.image_path);
  const title = it.type === "project" ? it.project.name : it.work.title;
  const text = it.type === "project" ? it.project.tagline : it.work.description;
  const p = it.type === "project" ? it.project : null;
  const pct = p && p.goal_target ? Math.min(100, Math.round((p.goal_current / p.goal_target) * 100)) : null;
  return (
    <Go it={it} className={`dv-tile ${img ? "has-img" : "no-img"} t-${it.type}`} style={{ "--c": n?.color ?? "#141414", "--i": Math.min(i, 14) } as React.CSSProperties}>
      {img && <span className="dv-tile-img"><img src={img} alt="" loading="lazy" /></span>}
      <span className="dv-tile-body">
        <span className="dv-kicker"><i />{it.type === "project" ? "Проект" : "Proof of Work"}{n && ` · ${n.title}`}</span>
        <b className="dv-tile-title">{title}</b>
        {it.type === "work" && it.work.result && <span className="dv-result mono">{it.work.result}</span>}
        {text && <span className="dv-tile-text">{text}</span>}
        {pct !== null && (
          <span className="dv-goal">
            <span><small>{p!.goal_label || "Цель"}</small><em className="mono">{pct}%</em></span>
            <span className="dv-goal-bar"><i style={{ width: `${pct}%` }} /></span>
          </span>
        )}
        {p?.looking_for && <span className="dv-need">Ищут: {p.looking_for}</span>}
        <Author it={it} />
      </span>
    </Go>
  );
}
