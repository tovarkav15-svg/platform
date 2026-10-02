"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useRatings } from "../Reviews";
import { MyOrders, MyResponses, OrderEditor, OrdersBoard, type Order } from "./Orders";
import { jobsDark, setJobsTheme } from "@/lib/prefs";

type Sort = "new" | "cheap" | "pricey";
const SIDES = [
  { id: "pros", label: "Специалисты", sub: "Бейджи фрилансеров" },
  { id: "orders", label: "Заказы", sub: "Задачи от заказчиков" },
  { id: "my-orders", label: "Мои заказы", sub: "Я заказчик" },
  { id: "my-responses", label: "Мои отклики", sub: "Я исполнитель" },
] as const;
type Side = (typeof SIDES)[number]["id"];

export default function JobsPage() {
  const { ready, me } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [edit, setEdit] = useState<Job | null | "new">(null);
  const [open, setOpen] = useState<JobRow | null>(null);
  const [notice, setNotice] = useState("");
  const sp = useSearchParams();
  const side: Side = SIDES.find((s) => s.id === sp.get("tab"))?.id ?? "pros";
  const [orderEdit, setOrderEdit] = useState<Order | null | "new">(null);
  const [ordersKey, setOrdersKey] = useState(0);
  const newOrder = () => (me ? setOrderEdit("new") : router.push("/login"));
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(jobsDark()); }, []);
  const toggleTheme = () => { setJobsTheme(!dark); setDark(!dark); };

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
  const ratings = useRatings(active.map((r) => r.user_id));

  return (
    <>
      <TopBar />
      <div className="bx-bg" aria-hidden="true"><i /><i /></div>
      <main className="page wide bx">
        <header className="bx-head">
          <div className="bx-head-text">
            <span className="label">Биржа вакансий</span>
            <h1 className="h-xl caps">{side === "pros" ? <>Кто <span className="it">что</span> умеет</> : <>Работа <span className="it">и</span> заказы</>}</h1>
            <p className="lead">{side === "pros" ? "Бейдж на каждого специалиста: ниша, услуга, средний чек и кейсы. Нажми на бейдж, чтобы открыть подробности и написать в чат." : "Заказчики размещают задачи с бюджетом и сроком, специалисты откликаются. Выбрал исполнителя — и сразу общаетесь в чате."}</p>
          </div>
          <div className="bx-counter">
            <span><b className="mono"><CountUp value={active.length} /></b>бейджей</span>
            <span><b className="mono"><CountUp value={specialists} /></b>специалистов</span>
            {me
              ? <button type="button" className="btn" onClick={() => setEdit("new")}>+ Мой бейдж</button>
              : <Link className="btn" href="/register">Разместить себя</Link>}
            <button type="button" className="btn ghost" onClick={newOrder}>+ Заказ</button>
            <button type="button" className="bx-theme" onClick={toggleTheme} aria-label={dark ? "Светлая тема" : "Тёмная тема"} title={dark ? "Светлая тема" : "Тёмная тема"}>{dark ? "☀" : "☾"}</button>
            {mine.length > 0 && <small className="hint">Твоих на бирже: {mine.length}</small>}
          </div>
        </header>

        <nav className="bx-sides" aria-label="Разделы биржи">
          {SIDES.filter((s) => me || (s.id !== "my-orders" && s.id !== "my-responses")).map((s) => (
            <Link key={s.id} href={s.id === "pros" ? "/jobs/" : `/jobs/?tab=${s.id}`} replace scroll={false} className="bx-side" aria-current={side === s.id ? "page" : undefined}>
              <b>{s.label}</b><small>{s.sub}</small>
            </Link>
          ))}
        </nav>

        {notice && <div className="bx-notice" role="status">✓ {notice}</div>}
        {side === "orders" && <OrdersBoard key={ordersKey} me={me} onNew={newOrder} />}
        {side === "my-orders" && me && <MyOrders key={ordersKey} me={me} onNew={newOrder} onEdit={(o) => setOrderEdit(o)} />}
        {side === "my-responses" && me && <MyResponses me={me} />}
        {side === "pros" && (<>
        {rows === null ? <div className="skeleton bx-cf-ph" /> : featured.length > 0 && <Coverflow jobs={featured} onOpen={setOpen} />}

        {mine.some((r) => r.mod_status === "rejected") && <div className="bx-notice bad" role="status">Один из твоих бейджей отклонён модерацией — открой его, исправь и сохрани заново.</div>}
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
            {view.map((r, i) => (
              <JobBadge key={r.id} job={r} i={i} onOpen={() => setOpen(r)} rating={ratings[r.user_id]}
                onChat={r.user_id === me?.id ? undefined : async () => {
                  if (!me) return router.push("/login");
                  try { router.push(chatHref(await openDm(r.user_id))); } catch { window.alert("Этот человек принимает сообщения только от друзей. Открой бейдж и отправь заявку в друзья через профиль."); }
                }} />
            ))}
          </div>
        ) : (
          <div className="pf-empty">
            <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
            <p className="lead">{active.length ? "По этим фильтрам никого. Попробуй другую нишу." : "На бирже пока пусто. Повесь первый бейдж со своей услугой."}</p>
            {me && <button type="button" className="btn" onClick={() => setEdit("new")}>+ Мой бейдж</button>}
          </div>
        )}
        </>)}
      </main>
      <OrderEditor open={orderEdit !== null} order={orderEdit === "new" ? null : orderEdit} onClose={() => setOrderEdit(null)}
        onSaved={() => { setOrderEdit(null); setOrdersKey((k) => k + 1); setNotice("Заказ опубликован — специалисты уже видят его."); setTimeout(() => setNotice(""), 6000); if (side !== "my-orders") router.replace("/jobs/?tab=my-orders", { scroll: false }); }} />

      <JobDetail job={open} onClose={() => setOpen(null)} canWrite={!!me && open?.user_id !== me.id}
        onEdit={open && open.user_id === me?.id ? () => { setEdit(open); setOpen(null); } : undefined}
        onWrite={async () => { if (open) router.push(chatHref(await openDm(open.user_id))); }} />
      {me && <JobEditor open={edit !== null} onClose={() => setEdit(null)} userId={me.id} job={edit === "new" ? null : edit} onSaved={() => { load(); setNotice("Бейдж на бирже — его уже видят все."); setTimeout(() => setNotice(""), 6000); }}
        author={{ id: me.id, username: me.username, display_name: me.display_name, avatar: me.avatar, accent: me.accent, niches: me.niches, role: me.role, headline: me.headline, open_to_work: me.open_to_work, city: me.city, skills: me.skills }} />}
    </>
  );
}
