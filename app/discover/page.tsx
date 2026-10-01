"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase, publicMedia, PROFILE_CARD, STAGES, type Project, type ProfileCard, type Work } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { profileHref, projectHref } from "@/lib/links";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";

type Kind = "all" | "projects" | "work";
type Item =
  | { type: "project"; at: string; project: Project; author: ProfileCard }
  | { type: "work"; at: string; work: Work; author: ProfileCard };

const SLIDE_MS = 6000;

const meta = (it: Item) => {
  const niche = NICHES.find((n) => n.id === (it.type === "project" ? it.project.niche : it.work.niche));
  return it.type === "project"
    ? { id: it.project.id, title: it.project.name, text: it.project.tagline || it.project.description, img: publicMedia(it.project.image_path), niche, href: projectHref(it.project.id), external: false, extra: STAGES[it.project.stage], result: "" }
    : { id: it.work.id, title: it.work.title, text: it.work.description, img: publicMedia(it.work.image_path), niche, href: it.work.link || profileHref(it.author.username, "work"), external: !!it.work.link, extra: "Proof of Work", result: it.work.result };
};

export default function DiscoverPage() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [niche, setNiche] = useState("");
  const [looking, setLooking] = useState(false);

  useEffect(() => { document.title = "Discover"; }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [p, w] = await Promise.all([
        supabase.from("projects").select(`*, author:profiles!projects_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(60),
        supabase.from("works").select(`*, author:profiles!works_user_id_fkey(${PROFILE_CARD})`).order("created_at", { ascending: false }).limit(60),
      ]);
      setItems([
        ...((p.data as unknown as (Project & { author: ProfileCard })[]) ?? []).map(({ author, ...project }) => ({ type: "project" as const, at: project.updated_at, project, author })),
        ...((w.data as unknown as (Work & { author: ProfileCard })[]) ?? []).map(({ author, ...work }) => ({ type: "work" as const, at: work.created_at, work, author })),
      ].sort((a, b) => b.at.localeCompare(a.at)));
    })();
  }, [ready]);

  const view = useMemo(() => (items ?? []).filter((it) => {
    if (kind === "projects" && it.type !== "project") return false;
    if (kind === "work" && it.type !== "work") return false;
    if (niche && (it.type === "project" ? it.project.niche : it.work.niche) !== niche) return false;
    if (looking && !(it.type === "project" && it.project.looking_for)) return false;
    return true;
  }), [items, kind, niche, looking]);

  // В прожектор — свежие публикации с картинкой, если есть
  const spotlight = useMemo(() => {
    const list = items ?? [];
    const withImg = list.filter((it) => meta(it).img);
    return [...withImg, ...list.filter((it) => !meta(it).img)].slice(0, 5);
  }, [items]);

  return (
    <>
      <TopBar />
      <div className="dv-bg" aria-hidden="true"><i /><i /></div>
      <main className="page wide dv">
        <header className="dv-head">
          <div>
            <span className="label">Discover</span>
            <h1 className="h-xl caps">Что <span className="it">строят</span> другие</h1>
          </div>
          {me && <Link className="btn" href={profileHref(me.username, "projects")}>+ Показать своё</Link>}
        </header>

        {items === null ? <div className="skeleton dv-spot-ph" /> : spotlight.length > 0 && <Spotlight items={spotlight} />}

        {items === null ? (
          <div className="dv-wall">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="skeleton dv-pol-ph" style={{ height: 220 + (k % 3) * 60 }} />)}</div>
        ) : view.length ? (
          <div className="dv-wall" key={`${kind}-${niche}-${looking}`}>
            {view.map((it, i) => <Polaroid key={`${it.type}-${meta(it).id}`} it={it} i={i} />)}
          </div>
        ) : (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{items.length ? "По этим фильтрам пусто. Сними часть фильтров внизу." : "Стена пока пустая. Добавь проект или работу в профиль, и они появятся здесь."}</p>
            {me && <Link className="btn" href={profileHref(me.username, "projects")}>Добавить</Link>}
          </div>
        )}
      </main>

      <nav className="dv-dock" aria-label="Фильтры">
        <div className="dv-dock-kinds">
          {([["all", "Всё"], ["projects", "Проекты"], ["work", "Работы"]] as [Kind, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <span className="dv-dock-sep" />
        <div className="dv-dock-niches">
          {NICHES.map((n) => (
            <button key={n.id} type="button" aria-pressed={niche === n.id} title={n.title} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>
              <i />{niche === n.id && <span>{n.title}</span>}
            </button>
          ))}
        </div>
        <span className="dv-dock-sep" />
        <button type="button" className="dv-dock-look" aria-pressed={looking} onClick={() => setLooking((v) => !v)}>Ищут людей</button>
      </nav>
    </>
  );
}

/** Прожектор: слайды листаются сами, полоски сверху показывают время, клик по краям — назад/вперёд */
function Spotlight({ items }: { items: Item[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % items.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, paused, items.length]);

  const it = items[idx];
  const m = meta(it);

  return (
    <section className="dv-spot" style={{ "--c": m.niche?.color ?? "#7B61FF" } as React.CSSProperties}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="карусель">
      <div className="dv-bars">
        {items.map((_, i) => (
          <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Слайд ${i + 1}`}
            className={i < idx ? "done" : i === idx ? `now ${paused ? "paused" : ""}` : ""}>
            <i key={i === idx ? `run-${idx}` : "x"} style={{ animationDuration: `${SLIDE_MS}ms` }} />
          </button>
        ))}
      </div>
      <div className="dv-slide" key={m.id}>
        <div className="dv-slide-media">
          {m.img ? <img src={m.img} alt="" /> : <span className="dv-slide-glyph caps">{m.title.slice(0, 1)}</span>}
        </div>
        <div className="dv-slide-text">
          <span className="dv-slide-kind">{m.extra}{m.niche && <> · {m.niche.title}</>}</span>
          <h2 className="caps">{m.title}</h2>
          {m.result && <b className="dv-slide-result">{m.result}</b>}
          {m.text && <p>{m.text}</p>}
          <div className="dv-slide-foot">
            <Link href={profileHref(it.author.username)} className="dv-who">
              <Avatar name={it.author.display_name} avatar={it.author.avatar} accent={it.author.accent} size={30} />
              <span><b>{it.author.display_name}</b><small>@{it.author.username}</small></span>
            </Link>
            {m.external
              ? <a className="btn" href={m.href} target="_blank" rel="noopener noreferrer nofollow">Открыть ↗</a>
              : <Link className="btn" href={m.href}>Открыть</Link>}
          </div>
        </div>
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="dv-nav prev" onClick={() => setIdx((idx - 1 + items.length) % items.length)} aria-label="Назад">‹</button>
          <button type="button" className="dv-nav next" onClick={() => setIdx((idx + 1) % items.length)} aria-label="Вперёд">›</button>
        </>
      )}
    </section>
  );
}

/** Полароид на скотче: чуть повёрнут, при наведении выпрямляется и приподнимается */
function Polaroid({ it, i }: { it: Item; i: number }) {
  const m = meta(it);
  const tilt = ((i * 37) % 7) - 3; // от −3° до 3°, стабильно для каждой позиции
  const p = it.type === "project" ? it.project : null;
  const pct = p && p.goal_target ? Math.min(100, Math.round((p.goal_current / p.goal_target) * 100)) : null;
  const inner = (
    <>
      <span className="dv-tape" aria-hidden="true" />
      <div className={`dv-photo ${m.img ? "" : "no-img"}`}>
        {m.img ? <img src={m.img} alt="" loading="lazy" /> : <span className="dv-photo-glyph caps">{m.title.slice(0, 1)}</span>}
        <span className="dv-pin">{m.extra}</span>
      </div>
      <div className="dv-cap">
        {m.result && <b className="dv-result">{m.result}</b>}
        <h3>{m.title}</h3>
        {m.text && <p>{m.text}</p>}
        {pct !== null && <span className="dv-prog"><i style={{ width: `${pct}%` }} /><em className="mono">{p!.goal_current}/{p!.goal_target}</em></span>}
        {p?.looking_for && <span className="dv-looking">Ищут: {p.looking_for}</span>}
        <span className="dv-sign it">
          <Avatar name={it.author.display_name} avatar={it.author.avatar} accent={it.author.accent} size={20} />
          {it.author.display_name}{m.niche && <em style={{ "--c": m.niche.color } as React.CSSProperties}>{m.niche.title}</em>}
        </span>
      </div>
    </>
  );
  const style = { "--r": `${tilt}deg`, "--i": Math.min(i, 16), "--c": m.niche?.color ?? "#7B61FF" } as React.CSSProperties;
  return m.external
    ? <a className="dv-pol" style={style} href={m.href} target="_blank" rel="noopener noreferrer nofollow">{inner}</a>
    : <Link className="dv-pol" style={style} href={m.href}>{inner}</Link>;
}
