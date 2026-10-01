"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase, publicMedia, PROFILE_CARD, STAGES, type Project, type ProfileCard, type Work } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { profileHref, projectHref } from "@/lib/links";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { CountUp } from "../CountUp";

type Kind = "all" | "projects" | "work" | "looking";
type Item =
  | { type: "project"; at: string; project: Project; author: ProfileCard }
  | { type: "work"; at: string; work: Work; author: ProfileCard };

const KINDS: { id: Kind; label: string; icon: string; color: string }[] = [
  { id: "all", label: "Вся лента", icon: "✦", color: "#7B61FF" },
  { id: "projects", label: "Проекты", icon: "◆", color: "#2F7BFF" },
  { id: "work", label: "Proof of Work", icon: "●", color: "#FF6A3D" },
  { id: "looking", label: "Ищут людей", icon: "◎", color: "#1FA67A" },
];

const nicheOf = (it: Item) => NICHES.find((n) => n.id === (it.type === "project" ? it.project.niche : it.work.niche));
const weekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();

export default function DiscoverPage() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [niche, setNiche] = useState("");

  useEffect(() => { document.title = "Discover"; }, []);

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
  const fresh = all.filter((it) => it.at > weekAgo()).length;
  const authors = new Set(all.map((it) => it.author.id)).size;
  const growing = all
    .filter((it): it is Extract<Item, { type: "project" }> => it.type === "project" && it.project.goal_target > 0)
    .sort((a, b) => b.project.goal_current / b.project.goal_target - a.project.goal_current / a.project.goal_target)
    .slice(0, 3);

  // Подсветка пункта меню переезжает пружиной, как в Workspace
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-k="${kind}"]`);
      if (!el) return;
      setPill({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight });
      const n = nav.current;
      if (n && n.scrollWidth > n.clientWidth) n.scrollTo({ left: el.offsetLeft - 12, behavior: "smooth" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [kind, items]);

  const hour = new Date().getHours();
  const hello = hour < 5 ? "Ночная лента" : hour < 12 ? "Утренняя лента" : hour < 18 ? "Дневная лента" : "Вечерняя лента";

  return (
    <>
      <TopBar />
      <main className="ws2 dx">
        <div className="ws2-aurora dx-aurora" aria-hidden="true"><i /><i /><i /></div>

        <aside className="ws2-rail dx-rail">
          <div className="ws2-me">
            <span className="dx-logo">✦</span>
            <span><b>Discover</b><small>что строят другие</small></span>
          </div>

          <nav className="ws2-nav" ref={nav} aria-label="Лента">
            {pill && <span className="ws2-pill dx-pill" style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, height: pill.height, width: pill.width }} />}
            {KINDS.map((k) => (
              <button key={k.id} type="button" data-k={k.id} className="ws2-link dx-link" aria-current={kind === k.id ? "page" : undefined}
                style={{ "--ic": k.color } as React.CSSProperties} onClick={() => setKind(k.id)}>
                <i className="ws2-ico">{k.icon}</i>
                <span><b>{k.label}</b><small>{items ? `${byKind(k.id).length} публикаций` : "…"}</small></span>
              </button>
            ))}
          </nav>

          <div className="dx-niches">
            <span className="label">Ниши</span>
            <button type="button" className={`dx-niche ${!niche ? "on" : ""}`} onClick={() => setNiche("")}><i style={{ background: "#141414" }} />Все<em className="mono">{byKind(kind).length}</em></button>
            {NICHES.map((n) => {
              const c = byKind(kind).filter((it) => nicheOf(it)?.id === n.id).length;
              return (
                <button key={n.id} type="button" className={`dx-niche ${niche === n.id ? "on" : ""} ${c ? "" : "zero"}`} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>
                  <i />{n.title}<em className="mono">{c}</em>
                </button>
              );
            })}
          </div>

          {me && <Link className="btn dx-add" href={profileHref(me.username, "projects")}>+ Показать своё</Link>}
        </aside>

        <section className="ws2-main dx-main">
          <section className="ov-hello dx-hello">
            <span className="label">{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span>
            <h1 className="caps">{hello}<span className="it"> платформы</span></h1>
            <div className="dx-stats">
              <span><b className="mono"><CountUp value={fresh} /></b>новых за неделю</span>
              <span><b className="mono"><CountUp value={all.filter((i) => i.type === "project").length} /></b>проектов</span>
              <span><b className="mono"><CountUp value={all.filter((i) => i.type === "work").length} /></b>работ</span>
              <span><b className="mono"><CountUp value={authors} /></b>авторов</span>
            </div>
          </section>

          {items === null ? (
            <div className="ov-grid">{[0, 1, 2, 3].map((k) => <div key={k} className="skeleton dx-ph" />)}</div>
          ) : view.length === 0 ? (
            <div className="pf-empty">
              <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
              <p className="lead">{all.length ? "Здесь пусто. Выбери другую нишу или раздел слева." : "Лента пока пустая. Добавь проект или работу в профиль, и они появятся здесь."}</p>
              {me && <Link className="btn" href={profileHref(me.username, "projects")}>Добавить</Link>}
            </div>
          ) : (
            <>
              {focus && <Focus it={focus} />}

              {growing.length > 0 && kind !== "work" && !niche && (
                <section className="ov-card dx-growing" style={{ "--c": "#1FA67A" } as React.CSSProperties}>
                  <header><span className="ov-dot" /><b>Ближе всех к цели</b></header>
                  <ul>
                    {growing.map((g, i) => {
                      const pct = Math.min(100, Math.round((g.project.goal_current / g.project.goal_target) * 100));
                      return (
                        <li key={g.project.id} style={{ "--i": i } as React.CSSProperties}>
                          <Link href={projectHref(g.project.id)} className="dx-grow-row">
                            <span className="dx-grow-name"><b>{g.project.name}</b><small>{g.project.goal_label || "Цель"} · {g.author.display_name}</small></span>
                            <span className="fn-track"><i style={{ width: `${pct}%`, background: nicheOf(g)?.color ?? "#1FA67A" }} /></span>
                            <b className="mono">{pct}%</b>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {rest.length > 0 && (
                <div className="dx-grid" key={`${kind}-${niche}`}>
                  {rest.map((it, i) => <Tile key={`${it.type}-${it.type === "project" ? it.project.id : it.work.id}`} it={it} i={i} />)}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
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

/** «В фокусе»: самая свежая публикация крупно */
function Focus({ it }: { it: Item }) {
  const n = nicheOf(it);
  const img = publicMedia(it.type === "project" ? it.project.image_path : it.work.image_path);
  const title = it.type === "project" ? it.project.name : it.work.title;
  const text = it.type === "project" ? it.project.tagline || it.project.description : it.work.description;
  return (
    <Go it={it} className="dx-focus">
      <span className="dx-focus-media" style={{ "--c": n?.color ?? "#7B61FF" } as React.CSSProperties}>
        {img ? <img src={img} alt="" /> : <span className="dx-focus-glyph caps">{title.slice(0, 1)}</span>}
      </span>
      <span className="dx-focus-text">
        <span className="dx-chip"><i style={{ background: n?.color ?? "#7B61FF" }} />В фокусе · {it.type === "project" ? STAGES[it.project.stage] : "Proof of Work"}</span>
        <b className="dx-focus-title">{title}</b>
        {it.type === "work" && it.work.result && <span className="dx-result mono">{it.work.result}</span>}
        {text && <span className="dx-focus-desc">{text}</span>}
        <span className="dx-author"><Avatar name={it.author.display_name} avatar={it.author.avatar} accent={it.author.accent} size={28} userId={it.author.id} /><span><b>{it.author.display_name}</b><small>@{it.author.username}</small></span><em>Открыть →</em></span>
      </span>
    </Go>
  );
}

/** Плитка ленты в стиле карточек Обзора */
function Tile({ it, i }: { it: Item; i: number }) {
  const n = nicheOf(it);
  const img = publicMedia(it.type === "project" ? it.project.image_path : it.work.image_path);
  const title = it.type === "project" ? it.project.name : it.work.title;
  const text = it.type === "project" ? it.project.tagline : it.work.description;
  const p = it.type === "project" ? it.project : null;
  const pct = p && p.goal_target ? Math.min(100, Math.round((p.goal_current / p.goal_target) * 100)) : null;
  return (
    <Go it={it} className="ov-card dx-tile" style={{ "--c": n?.color ?? (it.type === "project" ? "#2F7BFF" : "#FF6A3D"), "--i": Math.min(i, 12) } as React.CSSProperties}>
        <header><span className="ov-dot" /><b>{it.type === "project" ? "Проект" : "Proof of Work"}</b>{n && <span className="dx-tile-niche">{n.title}</span>}</header>
        {img && <span className="dx-thumb"><img src={img} alt="" loading="lazy" /></span>}
        <b className="dx-tile-title">{title}</b>
        {it.type === "work" && it.work.result && <span className="dx-result mono">{it.work.result}</span>}
        {text && <span className="dx-tile-text">{text}</span>}
        {pct !== null && <span className="dx-prog"><span>{p!.goal_label || "Цель"}</span><em className="mono">{p!.goal_current}/{p!.goal_target}</em><i style={{ width: `${pct}%` }} /></span>}
        {p?.looking_for && <span className="dx-looking">Ищут: {p.looking_for}</span>}
        <span className="dx-author small"><Avatar name={it.author.display_name} avatar={it.author.avatar} accent={it.author.accent} size={22} userId={it.author.id} /><b>{it.author.display_name}</b></span>
    </Go>
  );
}
