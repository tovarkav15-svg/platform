"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase, publicMedia, isOwner, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { LEVELS, articleHref, nicheHref, readMinutes, renderMarkdown, type Article } from "@/lib/learn";
import { profileHref } from "@/lib/links";
import { TopBar } from "../../TopBar";
import { Avatar } from "../../Avatar";

export default function ArticlePage() {
  const slug = useSearchParams().get("a") ?? "";
  const { ready, me } = useSession();
  const [a, setA] = useState<Article | null | "missing">(null);
  const [author, setAuthor] = useState<ProfileCard | null>(null);
  const [siblings, setSiblings] = useState<Pick<Article, "slug" | "title">[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!ready || !slug) return;
    (async () => {
      const { data } = await supabase.from("articles").select("*").eq("slug", slug).maybeSingle();
      if (!data) return setA("missing");
      setA(data as Article);
      document.title = data.title;
      const [{ data: au }, { data: sib }] = await Promise.all([
        data.author_id ? supabase.from("profiles").select(PROFILE_CARD).eq("id", data.author_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("articles").select("slug, title").eq("niche", data.niche).eq("published", true).order("position").order("created_at"),
      ]);
      setAuthor(au as ProfileCard | null);
      setSiblings((sib as Pick<Article, "slug" | "title">[]) ?? []);
    })();
  }, [ready, slug]);

  // Полоска прочитанного сверху
  useEffect(() => {
    const on = () => {
      const h = document.documentElement;
      setProgress(Math.min(1, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)));
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const md = useMemo(() => (a && a !== "missing" ? renderMarkdown(a.body) : { html: "", toc: [] }), [a]);

  if (a === "missing") return (<><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Статья не найдена.</p><Link className="btn" href="/learn/">К обучению</Link></div></main></>);
  if (!a) return (<><TopBar /><main className="page"><div className="skeleton profile-skeleton" /></main></>);

  const niche = NICHES.find((n) => n.id === a.niche);
  const cover = publicMedia(a.cover_path);
  const i = siblings.findIndex((s) => s.slug === a.slug);
  const prev = i > 0 ? siblings[i - 1] : null;
  const next = i >= 0 && i < siblings.length - 1 ? siblings[i + 1] : null;

  return (
    <>
      <TopBar />
      <div className="ar-progress" style={{ transform: `scaleX(${progress})`, "--c": niche?.color } as React.CSSProperties} aria-hidden="true" />
      <main className="ar" style={{ "--c": niche?.color ?? "#7B61FF" } as React.CSSProperties}>
        <nav className="lr-crumbs"><Link href="/learn/">Обучение</Link><span>/</span><Link href={nicheHref(a.niche)}>{niche?.title}</Link></nav>
        <header className="ar-head">
          <span className="ln-meta"><em className={`lvl lvl-${a.level}`}>{LEVELS[a.level]}</em>{readMinutes(a.body)} мин чтения · {new Date(a.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{!a.published && <em className="lvl draft">черновик</em>}</span>
          <h1 className="ar-title">{a.title}</h1>
          {a.summary && <p className="ar-summary">{a.summary}</p>}
          <div className="ar-by">
            {!author && <span className="dx-author"><span className="ar-team" aria-hidden="true">✦</span><span><b>Команда платформы</b><small>редакция Обучения</small></span></span>}
            {author && <Link href={profileHref(author.username)} className="dx-author"><Avatar name={author.display_name} avatar={author.avatar} accent={author.accent} size={32} userId={author.id} /><span><b>{author.display_name}</b><small>@{author.username}</small></span></Link>}
            {isOwner(me?.role) && <Link className="btn ghost sm" href={`/learn/edit/?a=${a.slug}`}>Изменить</Link>}
          </div>
        </header>
        {cover && <figure className="ar-cover"><img src={cover} alt="" /></figure>}
        <div className="ar-layout">
          {md.toc.length > 1 && (
            <aside className="ar-toc">
              <span className="label">Содержание</span>
              {md.toc.map((t) => <a key={t.id} href={`#${t.id}`}>{t.text}</a>)}
            </aside>
          )}
          <article className="ar-body" dangerouslySetInnerHTML={{ __html: md.html || "<p>Текст статьи пока пустой.</p>" }} />
        </div>
        <nav className="ln-pager">
          {prev ? <Link href={articleHref(prev.slug)}><small>← Предыдущая</small><b>{prev.title}</b></Link> : <Link href={nicheHref(a.niche)}><small>← Ниша</small><b>{niche?.title}</b></Link>}
          {next ? <Link href={articleHref(next.slug)}><small>Следующая →</small><b>{next.title}</b></Link> : <Link href="/learn/"><small>Все ниши →</small><b>Обучение</b></Link>}
        </nav>
      </main>
    </>
  );
}
