"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, PROFILE_CARD } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { openDm } from "@/lib/api";
import { chatHref } from "@/lib/links";
import { NICHES } from "@/lib/niches";
import { TopBar } from "../TopBar";
import { CountUp } from "../CountUp";
import { Coverflow, JobBadge, JobDetail, type Job, type JobRow } from "./JobCard";
import { JobEditor } from "./JobEditor";
import { BadgeGuide } from "./BadgeGuide";

type Sort = "new" | "cheap" | "pricey";

export default function JobsPage() {
  const { ready, me } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [edit, setEdit] = useState<Job | null | "new">(null);
  const [open, setOpen] = useState<JobRow | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("jobs").select(`*, author:profiles!jobs_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(120);
    setRows(((data as unknown as JobRow[]) ?? []).map((r) => ({ ...r, cases: Array.isArray(r.cases) ? r.cases : [] })));
  }, []);

  useEffect(() => { document.title = "Биржа вакансий"; if (ready) load(); }, [ready, load]);

  const active = useMemo(() => (rows ?? []).filter((r) => r.active || r.user_id === me?.id), [rows, me]);
  const view = useMemo(() => {
    let list = active;
    if (niche) list = list.filter((r) => r.niche === niche);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => [r.service, r.description, r.author.display_name, r.author.username].some((x) => x.toLowerCase().includes(s)));
    if (sort === "cheap") list = [...list].sort((a, b) => (a.avg_check || 1e12) - (b.avg_check || 1e12));
    if (sort === "pricey") list = [...list].sort((a, b) => b.avg_check - a.avg_check);
    return list;
  }, [active, niche, q, sort]);

  // В карусель — карточки с фото и кейсами вперёд
  const featured = useMemo(() => [...active].sort((a, b) => Number(!!b.photo_path) - Number(!!a.photo_path) || b.cases.length - a.cases.length).slice(0, 7), [active]);
  const mine = active.filter((r) => r.user_id === me?.id);
  const specialists = new Set(active.map((r) => r.user_id)).size;

  return (
    <>
      <TopBar />
      <div className="bx-bg" aria-hidden="true"><i /><i /></div>
      <main className="page wide bx">
        <header className="bx-head">
          <div className="bx-head-text">
            <span className="label">Биржа вакансий</span>
            <h1 className="h-xl caps">Кто <span className="it">что</span> умеет</h1>
            <p className="lead">Бейдж на каждого специалиста: ниша, услуга, средний чек и кейсы. Нажми на бейдж, чтобы открыть подробности и написать в чат.</p>
          </div>
          <div className="bx-counter">
            <span><b className="mono"><CountUp value={active.length} /></b>бейджей</span>
            <span><b className="mono"><CountUp value={specialists} /></b>специалистов</span>
            {me
              ? <button type="button" className="btn" onClick={() => setEdit("new")}>+ Мой бейдж</button>
              : <Link className="btn" href="/register">Разместить себя</Link>}
            {mine.length > 0 && <small className="hint">Твоих на бирже: {mine.length}</small>}
          </div>
        </header>

        {rows === null ? <div className="skeleton bx-cf-ph" /> : featured.length > 0 && <Coverflow jobs={featured} onOpen={setOpen} />}

        <BadgeGuide onCreate={me ? () => setEdit("new") : undefined} />

        <div className="bx-tools">
          <div className="input bx-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Услуга, имя или @ник" aria-label="Поиск" /></div>
          <select className="mini-select" value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Ниша">
            <option value="">Все ниши</option>
            {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
          <div className="seg small">
            {([["new", "Свежие"], ["cheap", "Дешевле"], ["pricey", "Дороже"]] as [Sort, string][]).map(([k, l]) => (
              <button key={k} type="button" className="seg-item" aria-current={sort === k ? "page" : undefined} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="bx-board">{[0, 1, 2, 3].map((k) => <div key={k} className="skeleton bd-ph" />)}</div>
        ) : view.length ? (
          <div className="bx-board" key={`${niche}-${sort}`}>
            {view.map((r, i) => <JobBadge key={r.id} job={r} i={i} onOpen={() => setOpen(r)} />)}
          </div>
        ) : (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{active.length ? "По этим фильтрам никого. Попробуй другую нишу." : "На бирже пока пусто. Повесь первый бейдж со своей услугой."}</p>
            {me && <button type="button" className="btn" onClick={() => setEdit("new")}>+ Мой бейдж</button>}
          </div>
        )}
      </main>

      <JobDetail job={open} onClose={() => setOpen(null)} canWrite={!!me && open?.user_id !== me.id}
        onEdit={open && open.user_id === me?.id ? () => { setEdit(open); setOpen(null); } : undefined}
        onWrite={async () => { if (open) router.push(chatHref(await openDm(open.user_id))); }} />
      {me && <JobEditor open={edit !== null} onClose={() => setEdit(null)} userId={me.id} job={edit === "new" ? null : edit} onSaved={load}
        author={{ id: me.id, username: me.username, display_name: me.display_name, avatar: me.avatar, accent: me.accent, niches: me.niches, role: me.role, headline: me.headline, open_to_work: me.open_to_work, city: me.city, skills: me.skills }} />}
    </>
  );
}
