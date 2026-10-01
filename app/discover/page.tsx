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

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function weekNo(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

// Размер плитки в мозаике: первая крупная, дальше ритм из широких и высоких
const sizeOf = (i: number, hasImage: boolean) => (i === 0 ? "xl" : i % 7 === 3 ? "wide" : hasImage && i % 5 === 1 ? "tall" : "");

export default function DiscoverPage() {
  const { ready, me } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [niche, setNiche] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => { document.title = "Discover"; }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [p, w] = await Promise.all([
        supabase.from("projects").select(`*, author:profiles!projects_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(60),
        supabase.from("works").select(`*, author:profiles!works_user_id_fkey(${PROFILE_CARD})`).order("created_at", { ascending: false }).limit(60),
      ]);
      const list: Item[] = [
        ...((p.data as unknown as (Project & { author: ProfileCard })[]) ?? []).map(({ author, ...project }) => ({ type: "project" as const, at: project.updated_at, project, author })),
        ...((w.data as unknown as (Work & { author: ProfileCard })[]) ?? []).map(({ author, ...work }) => ({ type: "work" as const, at: work.created_at, work, author })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      setItems(list);
    })();
  }, [ready]);

  const view = useMemo(() => (items ?? []).filter((it) => {
    if (kind === "projects" && it.type !== "project") return false;
    if (kind === "work" && it.type !== "work") return false;
    if (author && it.author.id !== author) return false;
    const n = it.type === "project" ? it.project.niche : it.work.niche;
    if (niche && n !== niche) return false;
    if (looking && !(it.type === "project" && it.project.looking_for)) return false;
    return true;
  }), [items, kind, niche, author, looking]);

  // Авторы со свежими публикациями — лента «историй»
  const authors = useMemo(() => {
    const map = new Map<string, { a: ProfileCard; n: number }>();
    (items ?? []).forEach((it) => { const e = map.get(it.author.id); map.set(it.author.id, { a: it.author, n: (e?.n ?? 0) + 1 }); });
    return [...map.values()].slice(0, 14);
  }, [items]);

  const now = new Date();
  const projects = (items ?? []).filter((i) => i.type === "project").length;
  const works = (items ?? []).filter((i) => i.type === "work").length;
  const nicheCounts = (id: string) => (items ?? []).filter((it) => (it.type === "project" ? it.project.niche : it.work.niche) === id).length;

  return (
    <>
      <TopBar />
      <main className="page wide dsc">
        <header className="dsc-mast">
          <div className="dsc-issue">
            <span className="mono">Выпуск №{weekNo(now)}</span>
            <span>{now.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
            <span className="mono">{projects} {plural(projects, "проект", "проекта", "проектов")} · {works} {plural(works, "работа", "работы", "работ")}</span>
          </div>
          <h1 className="dsc-title" aria-label="Discover">
            {"DISCOVER".split("").map((ch, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{ch}</span>)}
          </h1>
          <div className="dsc-sub">
            <p className="it">что строят другие, пока ты читаешь это</p>
            {me && <Link className="btn" href={profileHref(me.username, "projects")}>Показать своё</Link>}
          </div>
        </header>

        {authors.length > 0 && (
          <div className="dsc-stories" role="list" aria-label="Авторы">
            <button type="button" role="listitem" className={`story all ${!author ? "on" : ""}`} onClick={() => setAuthor(null)}>
              <span className="story-ring"><span className="story-all">✦</span></span><small>Все</small>
            </button>
            {authors.map(({ a, n }, i) => (
              <button key={a.id} type="button" role="listitem" className={`story ${author === a.id ? "on" : ""}`} style={{ "--i": i } as React.CSSProperties} onClick={() => setAuthor(author === a.id ? null : a.id)}>
                <span className="story-ring"><Avatar name={a.display_name} avatar={a.avatar} accent={a.accent} size={58} /></span>
                <small>{a.display_name}</small>
                {n > 1 && <em className="mono">{n}</em>}
              </button>
            ))}
          </div>
        )}

        <nav className="dsc-niches" aria-label="Ниши">
          <button type="button" className={!niche ? "on" : ""} onClick={() => setNiche("")}>Всё<sup className="mono">{items?.length ?? 0}</sup></button>
          {NICHES.map((n) => (
            <button key={n.id} type="button" className={niche === n.id ? "on" : ""} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>
              {n.title}<sup className="mono">{nicheCounts(n.id)}</sup>
            </button>
          ))}
        </nav>

        <div className="dsc-bar">
          <div className="seg small">
            {([["all", "Всё"], ["projects", "Проекты"], ["work", "Proof of Work"]] as [Kind, string][]).map(([k, l]) => (
              <button key={k} type="button" className="seg-item" aria-current={kind === k ? "page" : undefined} onClick={() => setKind(k)}>{l}</button>
            ))}
          </div>
          <label className="mini-toggle"><input type="checkbox" checked={looking} onChange={(e) => setLooking(e.target.checked)} /> Только где ищут людей</label>
        </div>

        {items === null ? <div className="dsc-grid">{[0, 1, 2, 3].map((k) => <div key={k} className={`skeleton dsc-ph ${k === 0 ? "xl" : ""}`} />)}</div> : view.length ? (
          <div className="dsc-grid" key={`${kind}-${niche}-${author}-${looking}`}>
            {view.map((it, i) => it.type === "project"
              ? <DProject key={`p-${it.project.id}`} p={it.project} a={it.author} i={i} />
              : <DWork key={`w-${it.work.id}`} w={it.work} a={it.author} i={i} />)}
          </div>
        ) : (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{items.length ? "По этим фильтрам пусто. Сними часть фильтров." : "Выпуск пока пустой. Добавь проект или работу в профиль, и они попадут на обложку."}</p>
            {me && <Link className="btn" href={profileHref(me.username, "projects")}>Добавить</Link>}
          </div>
        )}
      </main>
    </>
  );
}

function AuthorLine({ a }: { a: ProfileCard }) {
  return (
    <Link href={profileHref(a.username)} className="dc-author" onClick={(e) => e.stopPropagation()}>
      <Avatar name={a.display_name} avatar={a.avatar} accent={a.accent} size={22} /><span>{a.display_name}</span>
    </Link>
  );
}

function DProject({ p, a, i }: { p: Project; a: ProfileCard; i: number }) {
  const n = NICHES.find((x) => x.id === p.niche);
  const img = publicMedia(p.image_path);
  const pct = p.goal_target ? Math.min(100, Math.round((p.goal_current / p.goal_target) * 100)) : null;
  return (
    <article className={`dc ${sizeOf(i, !!img)} ${img ? "has-img" : "no-img"}`} style={{ "--i": Math.min(i, 14), "--c": n?.color ?? "#7B61FF" } as React.CSSProperties}>
      <Link href={projectHref(p.id)} className="dc-link" aria-label={p.name} />
      <div className="dc-media">{img ? <img src={img} alt="" loading="lazy" /> : <span className="dc-glyph">{p.name.slice(0, 1)}</span>}</div>
      <div className="dc-top">
        <span className="dc-kind">Проект</span>
        <span className={`stage stage-${p.stage}`}>{STAGES[p.stage]}</span>
      </div>
      <div className="dc-panel">
        <AuthorLine a={a} />
        <h3>{p.name}</h3>
        {p.tagline && <p>{p.tagline}</p>}
        {pct !== null && (
          <div className="dc-goal"><span>{p.goal_label || "Цель"}</span><b className="mono">{p.goal_current}/{p.goal_target}</b><i style={{ width: `${pct}%` }} /></div>
        )}
        {p.looking_for && <span className="dc-looking">Ищут: {p.looking_for}</span>}
      </div>
    </article>
  );
}

function DWork({ w, a, i }: { w: Work; a: ProfileCard; i: number }) {
  const n = NICHES.find((x) => x.id === w.niche);
  const img = publicMedia(w.image_path);
  return (
    <article className={`dc work ${sizeOf(i, !!img)} ${img ? "has-img" : "no-img"}`} style={{ "--i": Math.min(i, 14), "--c": n?.color ?? "#FF6A3D" } as React.CSSProperties}>
      {w.link && <a href={w.link} target="_blank" rel="noopener noreferrer nofollow" className="dc-link" aria-label={w.title} />}
      <div className="dc-media">{img ? <img src={img} alt="" loading="lazy" /> : <span className="dc-glyph">{w.title.slice(0, 1)}</span>}</div>
      <div className="dc-top">
        <span className="dc-kind">Proof of Work</span>
        {n && <span className="dc-niche">{n.title}</span>}
      </div>
      <div className="dc-panel">
        <AuthorLine a={a} />
        {w.result && <b className="dc-result">{w.result}</b>}
        <h3>{w.title}</h3>
        {w.description && <p>{w.description}</p>}
      </div>
    </article>
  );
}
