"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, isOwner, banInfo, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { JobBadge, rub, type JobRow } from "../jobs/JobCard";
import { UserPanel } from "./UserPanel";
import { budgetText, type Order } from "../jobs/Orders";
import { NICHES } from "@/lib/niches";

type Report = { id: string; reporter: string; target_user: string; message_id: string | null; reason: string; details: string; status: string; created_at: string; r: ProfileCard; t: ProfileCard & { banned_until: string | null } };
type Banned = ProfileCard & { banned_until: string; ban_reason: string };
type Log = { id: number; action: string; note: string; created_at: string; m: ProfileCard; u: ProfileCard | null };

const TABS = [
  { id: "badges", label: "Бейджи", sub: "Новые и изменённые" },
  { id: "orders", label: "Заказы", sub: "От заказчиков" },
  { id: "reports", label: "Жалобы", sub: "От пользователей" },
  { id: "users", label: "Пользователи", sub: "Поиск и баны" },
  { id: "log", label: "Журнал", sub: "Кто что сделал" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ACTION: Record<string, string> = { ban: "забанил", unban: "разбанил", approve_job: "одобрил бейдж", reject_job: "отклонил бейдж", approve_order: "одобрил заказ", reject_order: "отклонил заказ", delete_order: "удалил заказ", clear_profile: "очистил в профиле", wipe: "стёр весь контент", delete_work: "удалил работу", delete_project: "удалил проект", delete_job: "удалил бейдж", delete_review: "удалил отзыв", delete_chat: "удалил канал", delete_message: "удалил сообщение" };

/** Модерация: только для @fedonko и @awiny (роль owner). Права проверяет база, страница лишь показывает */
export default function ModerationPage() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const router = useRouter();
  const tab: Tab = TABS.find((t) => t.id === sp.get("tab"))?.id ?? "badges";
  const [counts, setCounts] = useState({ badges: 0, reports: 0, orders: 0 });
  const allowed = isOwner(me?.role);

  const loadCounts = useCallback(async () => {
    const [b, r, o] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("mod_status", "pending"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("mod_status", "pending"),
    ]);
    setCounts({ badges: b.count ?? 0, reports: r.count ?? 0, orders: o.count ?? 0 });
  }, []);
  useEffect(() => {
    document.title = "Модерация";
    if (!allowed) return;
    loadCounts();
    const t = setInterval(loadCounts, 20000); // новые бейджи, заказы и жалобы подтягиваются сами
    return () => clearInterval(t);
  }, [allowed, loadCounts]);

  if (me && !allowed) return (<><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Эта страница только для модераторов Relic.</p><Link className="btn" href="/">На главную</Link></div></main></>);

  return (
    <>
      <TopBar />
      <main className="page wide md">
        <header className="md-head">
          <div><span className="label">Relic · только для команды</span><h1 className="md-title">Модерация</h1></div>
          <nav className="md-tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="md-tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => router.replace(`/moderation/?tab=${t.id}`, { scroll: false })}>
                <b>{t.label}{t.id === "badges" && counts.badges > 0 && <em>{counts.badges}</em>}{t.id === "reports" && counts.reports > 0 && <em>{counts.reports}</em>}{t.id === "orders" && counts.orders > 0 && <em>{counts.orders}</em>}</b><small>{t.sub}</small>
              </button>
            ))}
          </nav>
        </header>
        {!me ? <div className="skeleton list-skeleton" /> : (
          <div key={tab} className="md-body">
            {tab === "badges" && <Badges onChange={loadCounts} />}
            {tab === "reports" && <Reports onChange={loadCounts} />}
            {tab === "orders" && <OrdersQueue onChange={loadCounts} />}
            {tab === "users" && <Users initial={sp.get("u")} />}
            {tab === "log" && <LogView />}
          </div>
        )}
      </main>
    </>
  );
}

function Badges({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "rejected" | "approved">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from("jobs").select(`*, author:profiles!jobs_user_id_fkey(${PROFILE_CARD})`).eq("mod_status", filter).order("updated_at", { ascending: false }).limit(100);
    setRows(((data as unknown as JobRow[]) ?? []).map((r) => ({ ...r, cases: Array.isArray(r.cases) ? r.cases : [] })));
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  async function decide(job: JobRow, approve: boolean) {
    const note = notes[job.id]?.trim() ?? "";
    if (!approve && !note && !window.confirm("Отклонить без причины? Автор не узнает, что исправить.")) return;
    const { error } = await supabase.rpc("moderate_job", { p_job: job.id, p_approve: approve, p_note: note });
    if (error) return window.alert(error.message);
    setRows((r) => (r ?? []).filter((x) => x.id !== job.id));
    onChange();
  }
  return (
    <section className="md-section">
      <div className="seg small">
        {([["pending", "Новые · уже видны"], ["rejected", "Отклонённые"], ["approved", "Проверенные"]] as const).map(([k, l]) => (
          <button key={k} type="button" className="seg-item" aria-current={filter === k ? "page" : undefined} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {rows === null ? <div className="skeleton list-skeleton" /> : rows.length === 0 ? (
        <p className="md-empty">{filter === "pending" ? "Очередь пустая — все бейджи проверены ✓" : "Здесь пусто."}</p>
      ) : (
        <div className="md-badges">
          {rows.map((j, i) => (
            <article key={j.id} className="md-badge">
              <div className="md-badge-art"><JobBadge job={j} i={i} onOpen={() => {}} /></div>
              <div className="md-badge-info">
                <Link href={profileHref(j.author.username)} className="md-who"><Avatar name={j.author.display_name} avatar={j.author.avatar} accent={j.author.accent} size={32} /><span><b>{j.author.display_name}</b><small>@{j.author.username}</small></span></Link>
                <dl>
                  <dt>Услуга</dt><dd>{j.service}</dd>
                  <dt>Средний чек</dt><dd className="mono">{rub(j.avg_check)}</dd>
                  {j.description && <><dt>Описание</dt><dd>{j.description}</dd></>}
                  {j.cases.length > 0 && <><dt>Кейсы</dt><dd>{j.cases.map((c, k) => <div key={k}>{c.link ? <a href={c.link} target="_blank" rel="noopener noreferrer nofollow">{c.title || c.link} ↗</a> : c.title}</div>)}</dd></>}
                  <dt>Обновлён</dt><dd>{new Date(j.updated_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd>
                </dl>
                <textarea className="bl-in" rows={2} maxLength={300} placeholder="Причина или подсказка автору (увидит при отказе)" value={notes[j.id] ?? (j as JobRow & { mod_note?: string }).mod_note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [j.id]: e.target.value }))} />
                <div className="md-actions">
                  {filter !== "approved" && <button type="button" className="btn md-ok" onClick={() => decide(j, true)}>✓ Всё ок</button>}
                  {filter !== "rejected" && <button type="button" className="btn danger" onClick={() => decide(j, false)}>✕ Скрыть</button>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BanButton({ user, onDone }: { user: { id: string; display_name: string; banned_until?: string | null }; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const banned = banInfo(user.banned_until).banned;
  if (banned) return <button type="button" className="chip-btn" onClick={async () => { const { error } = await supabase.rpc("unban_user", { p_user: user.id }); if (error) window.alert(error.message); onDone(); }}>Разбанить</button>;
  return open ? (
    <div className="md-ban">
      <select className="mini-select" value={days} onChange={(e) => setDays(e.target.value)}>
        <option value="1">1 день</option><option value="3">3 дня</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="forever">Навсегда</option>
      </select>
      <input className="bl-in" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (увидит пользователь)" maxLength={300} />
      <button type="button" className="btn danger sm" onClick={async () => {
        if (!window.confirm(`Забанить ${user.display_name}${days === "forever" ? " навсегда" : ` на ${days} дн.`}?`)) return;
        const { error } = await supabase.rpc("ban_user", { p_user: user.id, p_days: days === "forever" ? null : Number(days), p_reason: reason.trim() });
        if (error) window.alert(error.message); else { setOpen(false); onDone(); }
      }}>Забанить</button>
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>Отмена</button>
    </div>
  ) : <button type="button" className="chip-btn md-danger" onClick={() => setOpen(true)}>⊘ Бан</button>;
}

function Reports({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Report[] | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed">("open");
  const load = useCallback(async () => {
    const { data } = await supabase.from("reports").select(`*, r:profiles!reports_reporter_fkey(${PROFILE_CARD}), t:profiles!reports_target_user_fkey(${PROFILE_CARD}, banned_until)`).eq("status", status).order("created_at", { ascending: false }).limit(100);
    const list = (data as unknown as Report[]) ?? [];
    setRows(list);
    const ids = list.map((x) => x.message_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: m } = await supabase.from("messages").select("id, text, kind, deleted_at").in("id", ids);
      setMsgs(Object.fromEntries((m ?? []).map((x) => [x.id, x.deleted_at ? "(сообщение удалено)" : x.kind === "text" ? x.text : `[${x.kind}]`])));
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  async function close(r: Report, st: "resolved" | "dismissed") {
    await supabase.from("reports").update({ status: st }).eq("id", r.id);
    load(); onChange();
  }
  return (
    <section className="md-section">
      <div className="seg small">
        {([["open", "Открытые"], ["resolved", "Решённые"], ["dismissed", "Отклонённые"]] as const).map(([k, l]) => (
          <button key={k} type="button" className="seg-item" aria-current={status === k ? "page" : undefined} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {rows === null ? <div className="skeleton list-skeleton" /> : rows.length === 0 ? <p className="md-empty">Жалоб нет.</p> : (
        <ul className="md-list">
          {rows.map((r) => (
            <li key={r.id} className="md-report">
              <div className="md-report-top">
                <span className="md-reason">{r.reason}</span>
                <small>{new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
              <div className="md-pair">
                <Link href={profileHref(r.t.username)} className="md-who"><Avatar name={r.t.display_name} avatar={r.t.avatar} accent={r.t.accent} size={32} /><span><b>{r.t.display_name}</b><small>@{r.t.username} · на кого</small></span></Link>
                <Link href={profileHref(r.r.username)} className="md-who muted"><Avatar name={r.r.display_name} avatar={r.r.avatar} accent={r.r.accent} size={24} /><span><b>{r.r.display_name}</b><small>пожаловался</small></span></Link>
              </div>
              {r.message_id && <blockquote className="md-quote">{msgs[r.message_id] ?? "…"}</blockquote>}
              {r.details && <p className="md-details">{r.details}</p>}
              <div className="md-actions">
                <BanButton user={{ id: r.target_user, display_name: r.t.display_name, banned_until: r.t.banned_until }} onDone={load} />
                <Link className="chip-btn" href={`/moderation/?tab=users&u=${r.t.username}`}>Контент пользователя</Link>
                {r.message_id && <button type="button" className="chip-btn" onClick={async () => { await supabase.rpc("delete_message", { p_id: r.message_id }); load(); }}>Удалить сообщение</button>}
                {status === "open" && <button type="button" className="chip-btn" onClick={() => close(r, "resolved")}>✓ Решено</button>}
                {status === "open" && <button type="button" className="chip-btn" onClick={() => close(r, "dismissed")}>Отклонить жалобу</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Users({ initial }: { initial: string | null }) {
  const [q, setQ] = useState(initial ?? "");
  const [panel, setPanel] = useState<string | null>(initial);
  const [found, setFound] = useState<(ProfileCard & { banned_until: string | null; ban_reason: string })[]>([]);
  const [banned, setBanned] = useState<Banned[] | null>(null);
  const loadBanned = useCallback(async () => {
    const { data } = await supabase.from("profiles").select(`${PROFILE_CARD}, banned_until, ban_reason`).gt("banned_until", new Date().toISOString()).order("banned_until", { ascending: false });
    setBanned((data as unknown as Banned[]) ?? []);
  }, []);
  const search = useCallback(async (s: string) => {
    const safe = s.replace(/[%,()*]/g, "").trim();
    if (!safe) return setFound([]);
    const { data } = await supabase.from("profiles").select(`${PROFILE_CARD}, banned_until, ban_reason`).or(`username.ilike.%${safe.replace(/^@/, "")}%,display_name.ilike.%${safe}%`).limit(20);
    setFound((data as unknown as typeof found) ?? []);
  }, []);
  useEffect(() => { loadBanned(); }, [loadBanned]);
  useEffect(() => { const t = setTimeout(() => search(q), 300); return () => clearTimeout(t); }, [q, search]);
  const refresh = () => { loadBanned(); search(q); };
  const row = (p: ProfileCard & { banned_until: string | null; ban_reason?: string }) => {
    const ban = banInfo(p.banned_until);
    const isBanned = ban.banned;
    return (
      <li key={p.id} className={`md-user ${isBanned ? "is-banned" : ""}`}>
        <Link href={profileHref(p.username)} className="md-who"><Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={36} /><span><b>{p.display_name}</b><small>@{p.username}</small></span></Link>
        {isBanned && <span className="md-ban-info">{ban.forever ? "навсегда" : `до ${ban.date!.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`}{p.ban_reason ? ` · ${p.ban_reason}` : ""}</span>}
        {isOwner(p.role) ? <span className="md-ban-info">модератор</span> : <><button type="button" className="chip-btn" onClick={() => setPanel(p.username)}>Контент</button><BanButton user={p} onDone={refresh} /></>}
      </li>
    );
  };
  return (
    <section className="md-section">
      <div className="pp-input"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти пользователя: имя или @юзернейм" aria-label="Поиск" /></div>
      {found.length > 0 && <ul className="md-list">{found.map(row)}</ul>}
      <h3 className="md-h">Забанены сейчас{banned ? ` · ${banned.length}` : ""}</h3>
      {banned === null ? <div className="skeleton list-skeleton" /> : banned.length === 0 ? <p className="md-empty">Никого.</p> : <ul className="md-list">{banned.map(row)}</ul>}
      <UserPanel username={panel} onClose={() => { setPanel(null); refresh(); }} />
    </section>
  );
}

function LogView() {
  const [rows, setRows] = useState<Log[] | null>(null);
  useEffect(() => {
    supabase.from("mod_log").select(`id, action, note, created_at, m:profiles!mod_log_moderator_fkey(${PROFILE_CARD}), u:profiles!mod_log_target_user_fkey(${PROFILE_CARD})`).order("id", { ascending: false }).limit(100)
      .then(({ data }) => setRows((data as unknown as Log[]) ?? []));
  }, []);
  return (
    <section className="md-section">
      {rows === null ? <div className="skeleton list-skeleton" /> : rows.length === 0 ? <p className="md-empty">Пока ничего не происходило.</p> : (
        <ul className="md-list md-log">
          {rows.map((r) => (
            <li key={r.id}>
              <b>{r.m.display_name}</b> {ACTION[r.action] ?? r.action}{r.u ? <> <Link href={profileHref(r.u.username)}>@{r.u.username}</Link></> : ""}
              {r.note && <span className="md-note"> · {r.note}</span>}
              <small>{new Date(r.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrdersQueue({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "rejected" | "approved">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select(`*, client:profiles!orders_client_id_fkey(${PROFILE_CARD})`).eq("mod_status", filter).order("updated_at", { ascending: false }).limit(100);
    setRows((data as unknown as Order[]) ?? []);
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  async function decide(o: Order, approve: boolean) {
    const note = notes[o.id]?.trim() ?? "";
    if (!approve && !note && !window.confirm("Отклонить без причины?")) return;
    const { error } = await supabase.rpc("moderate_order", { p_order: o.id, p_approve: approve, p_note: note });
    if (error) return window.alert(error.message);
    setRows((r) => (r ?? []).filter((x) => x.id !== o.id));
    onChange();
  }
  return (
    <section className="md-section">
      <div className="seg small">
        {([["pending", "Новые · уже видны"], ["rejected", "Отклонённые"], ["approved", "Проверенные"]] as const).map(([k, l]) => (
          <button key={k} type="button" className="seg-item" aria-current={filter === k ? "page" : undefined} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {rows === null ? <div className="skeleton list-skeleton" /> : rows.length === 0 ? <p className="md-empty">{filter === "pending" ? "Все заказы проверены ✓" : "Здесь пусто."}</p> : (
        <ul className="md-list">
          {rows.map((o) => (
            <li key={o.id} className="md-report">
              <div className="md-report-top"><span className="md-reason" style={{ background: "#EEF3FF", color: "#2B4FB0" }}>{NICHES.find((n) => n.id === o.niche)?.title}</span><small>{new Date(o.updated_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>
              <b style={{ fontSize: 17 }}>{o.title}</b>
              <small className="mono">{budgetText(o)}{o.deadline ? ` · до ${new Date(o.deadline).toLocaleDateString("ru-RU")}` : ""}</small>
              {o.description && <p className="md-details">{o.description}</p>}
              {o.client && <Link href={profileHref(o.client.username)} className="md-who"><Avatar name={o.client.display_name} avatar={o.client.avatar} accent={o.client.accent} size={30} /><span><b>{o.client.display_name}</b><small>@{o.client.username} · заказчик</small></span></Link>}
              <textarea className="bl-in" rows={2} maxLength={300} placeholder="Причина или подсказка автору" value={notes[o.id] ?? o.mod_note ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))} />
              <div className="md-actions">
                {filter !== "approved" && <button type="button" className="btn md-ok" onClick={() => decide(o, true)}>✓ Всё ок</button>}
                {filter !== "rejected" && <button type="button" className="btn danger" onClick={() => decide(o, false)}>✕ Скрыть</button>}
                <button type="button" className="chip-btn md-danger" onClick={async () => { if (window.confirm("Удалить заказ?")) { await supabase.rpc("mod_delete", { p_kind: "order", p_id: o.id }); load(); onChange(); } }}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
