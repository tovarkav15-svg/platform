"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, publicMedia, isOwner } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { LEVELS, NICHE_INFO, articleHref, readMinutes, type Article } from "@/lib/learn";
import { TopBar } from "../../TopBar";

type Level = "all" | Article["level"];

export default function NichePage() {
  const id = useSearchParams().get("n") ?? "";
  const { ready, me } = useSession();
  const niche = NICHES.find((n) => n.id === id);
  const info = NICHE_INFO[id];
  const [list, setList] = useState<Article[] | null>(null);
  const [level, setLevel] = useState<Level>("all");
  const owner = isOwner(me?.role);

  useEffect(() => {
    if (!ready || !niche) return;
    document.title = `${niche.title} · Обучение`;
    supabase.from("articles").select("*").eq("niche", id).order("position").order("created_at").then(({ data }) => setList((data as Article[]) ?? []));
  }, [ready, id, niche]);

  if (!niche) return (<><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Такой ниши нет.</p><Link className="btn" href="/learn/">Все ниши</Link></div></main></>);

  const shown = (list ?? []).filter((a) => level === "all" || a.level === level);
  const idx = NICHES.findIndex((n) => n.id === id);
  const prev = NICHES[(idx - 1 + NICHES.length) % NICHES.length];
  const next = NICHES[(idx + 1) % NICHES.length];

  return (
    <>
      <TopBar />
      <div className="lr-bg" aria-hidden="true" style={{ "--c": niche.color } as React.CSSProperties}><i /><i /><i /></div>
      <main className="page wide lr" style={{ "--c": niche.color } as React.CSSProperties}>
        <nav className="lr-crumbs"><Link href="/learn/">Обучение</Link><span>/</span><b>{niche.title}</b></nav>
        <header className="ln-hero">
          <span className="ln-big caps" aria-hidden="true">{niche.title}</span>
          <div className="ln-hero-text">
            <span className="label">Ниша {String(idx + 1).padStart(2, "0")} из {NICHES.length}</span>
            <h1 className="h-xl caps">{niche.title}</h1>
            <p className="lead">{info.tagline}</p>
            <div className="lr-topics">{info.topics.map((t) => <i key={t}>{t}</i>)}</div>
          </div>
          {owner && <Link className="btn" href={`/learn/edit/?n=${id}`}>+ Статья</Link>}
        </header>

        <div className="ln-bar">
          <div className="seg small">
            {(["all", "start", "middle", "pro"] as Level[]).map((l) => (
              <button key={l} type="button" className="seg-item" aria-current={level === l ? "page" : undefined} onClick={() => setLevel(l)}>{l === "all" ? "Все" : LEVELS[l]}</button>
            ))}
          </div>
          <span className="label">{list ? `${shown.length} материалов` : "…"}</span>
        </div>

        {list === null ? <div className="skeleton list-skeleton" /> : shown.length ? (
          <ol className="ln-list">
            {shown.map((a, i) => {
              const cover = publicMedia(a.cover_path);
              return (
                <li key={a.id} style={{ "--i": i } as React.CSSProperties}>
                  <Link href={articleHref(a.slug)} className={`ln-item ${a.published ? "" : "draft"}`}>
                    <span className="ln-n mono">{String(i + 1).padStart(2, "0")}</span>
                    {cover && <span className="ln-cover"><img src={cover} alt="" loading="lazy" /></span>}
                    <span className="ln-text">
                      <span className="ln-meta"><em className={`lvl lvl-${a.level}`}>{LEVELS[a.level]}</em>{readMinutes(a.body)} мин чтения{!a.published && <em className="lvl draft">черновик</em>}</span>
                      <b>{a.title}</b>
                      {a.summary && <small>{a.summary}</small>}
                    </span>
                    <span className="ln-go">→</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="ln-soon">
            <span className="ln-soon-art" aria-hidden="true"><i /><i /><i /></span>
            <b className="caps">Статьи <span className="it">уже</span> пишутся</b>
            <p className="lead">Первые материалы по нише «{niche.title}» появятся на этой неделе.</p>
            {owner && <Link className="btn" href={`/learn/edit/?n=${id}`}>Написать первую статью</Link>}
          </div>
        )}

        <nav className="ln-pager">
          <Link href={`/learn/niche/?n=${prev.id}`} style={{ "--c": prev.color } as React.CSSProperties}><small>← Предыдущая ниша</small><b>{prev.title}</b></Link>
          <Link href={`/learn/niche/?n=${next.id}`} style={{ "--c": next.color } as React.CSSProperties}><small>Следующая ниша →</small><b>{next.title}</b></Link>
        </nav>
      </main>
    </>
  );
}
