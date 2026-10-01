"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { openDm } from "@/lib/api";
import { chatHref } from "@/lib/links";
import { NICHES } from "@/lib/niches";
import { TopBar } from "../TopBar";
import { CountUp } from "../CountUp";
import { JobCard, type Job } from "./JobCard";
import { JobEditor } from "./JobEditor";

type Row = Job & { author: ProfileCard };
type Sort = "new" | "cheap" | "pricey";

export default function JobsPage() {
  const { ready, me } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [edit, setEdit] = useState<Job | null | "new">(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("jobs").select(`*, author:profiles!jobs_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(120);
    setRows(((data as unknown as Row[]) ?? []).map((r) => ({ ...r, cases: Array.isArray(r.cases) ? r.cases : [] })));
  }, []);

  useEffect(() => { document.title = "Биржа вакансий"; if (ready) load(); }, [ready, load]);

  const view = useMemo(() => {
    let list = (rows ?? []).filter((r) => r.active || r.user_id === me?.id);
    if (niche) list = list.filter((r) => r.niche === niche);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => [r.service, r.description, r.author.display_name, r.author.username].some((x) => x.toLowerCase().includes(s)));
    if (sort === "cheap") list = [...list].sort((a, b) => (a.avg_check || 1e12) - (b.avg_check || 1e12));
    if (sort === "pricey") list = [...list].sort((a, b) => b.avg_check - a.avg_check);
    return list;
  }, [rows, niche, q, sort, me]);

  const mine = (rows ?? []).filter((r) => r.user_id === me?.id);
  const checks = (rows ?? []).filter((r) => r.active && r.avg_check > 0).map((r) => r.avg_check).sort((a, b) => a - b);
  const median = checks.length ? checks[Math.floor(checks.length / 2)] : 0;

  return (
    <>
      <TopBar />
      <div className="jobs-bg" aria-hidden="true"><i /><i /><i /></div>
      <main className="page wide jobs">
        <section className="jobs-hero">
          <div className="jobs-hero-text">
            <span className="label">Биржа вакансий</span>
            <h1 className="h-xl caps">Найди <span className="it">своего</span> исполнителя</h1>
            <p className="lead">На каждой карточке человек и его услуга: ниша, средний чек, кейсы. Переверни карточку и напиши в чат.</p>
            <div className="jobs-hero-actions">
              {me ? <button type="button" className="btn" onClick={() => setEdit("new")}>+ Разместить вакансию</button> : <Link className="btn" href="/register">Зарегистрироваться и разместить</Link>}
              {mine.length > 0 && <span className="hint">У тебя {mine.length} {mine.length === 1 ? "карточка" : "карточки"} на бирже</span>}
            </div>
          </div>
          <div className="jobs-stack" aria-hidden="true">
            {(rows ?? []).slice(0, 3).map((r, k) => (
              <span key={r.id} className="jobs-stack-card" style={{ "--k": k } as React.CSSProperties}>
                <b>{r.service}</b><em className="mono">{r.avg_check ? `${Math.round(r.avg_check / 1000)}к ₽` : "—"}</em>
              </span>
            ))}
            {!rows?.length && [0, 1, 2].map((k) => <span key={k} className="jobs-stack-card ph" style={{ "--k": k } as React.CSSProperties} />)}
          </div>
          <div className="jobs-hero-stats">
            <span><b className="mono"><CountUp value={(rows ?? []).filter((r) => r.active).length} /></b>карточек</span>
            <span><b className="mono"><CountUp value={new Set((rows ?? []).map((r) => r.user_id)).size} /></b>специалистов</span>
            <span><b className="mono"><CountUp value={median} format={(n) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`} /></b>медианный чек</span>
          </div>
        </section>

        <div className="jobs-tools">
          <div className="input jobs-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Услуга, имя или @ник" aria-label="Поиск" /></div>
          <div className="seg small">
            {([["new", "Свежие"], ["cheap", "Дешевле"], ["pricey", "Дороже"]] as [Sort, string][]).map(([k, l]) => (
              <button key={k} type="button" className="seg-item" aria-current={sort === k ? "page" : undefined} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="filters">
          <button type="button" className={`fchip ${!niche ? "on" : ""}`} onClick={() => setNiche("")}>Все ниши</button>
          {NICHES.map((n) => (
            <button key={n.id} type="button" className={`fchip ${niche === n.id ? "on" : ""}`} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>{n.title}</button>
          ))}
        </div>

        {rows === null ? <div className="jobs-grid">{[0, 1, 2].map((k) => <div key={k} className="skeleton job-skeleton" />)}</div> : view.length ? (
          <div className="jobs-grid" key={`${niche}-${sort}`}>
            {view.map((r, i) => (
              <JobCard key={r.id} job={r} author={r.author} i={i}
                onEdit={r.user_id === me?.id ? () => setEdit(r) : undefined}
                onWrite={me && r.user_id !== me.id ? async () => router.push(chatHref(await openDm(r.user_id))) : undefined} />
            ))}
          </div>
        ) : (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{rows.length ? "По этим фильтрам никого. Попробуй другую нишу." : "На бирже пока пусто. Размести первую карточку со своей услугой."}</p>
            {me && <button type="button" className="btn" onClick={() => setEdit("new")}>Разместить вакансию</button>}
          </div>
        )}
      </main>
      {me && <JobEditor open={edit !== null} onClose={() => setEdit(null)} userId={me.id} job={edit === "new" ? null : edit} onSaved={load} />}
    </>
  );
}
