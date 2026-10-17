"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rub } from "@/lib/workspace";
import { PRIORITY, addDays, fromIso, iso, today } from "@/lib/plans";
import {
  BUCKETS, PROJECT_COLORS, STAGE_TEMPLATES, STATUSES, bucketOf, daysLeft, deadlineInfo, fmtClock, fmtDur, isOpen, isStale,
  nextStage, progress, spent, staleDays, statusOf,
  type Bucket, type Project, type ProjectStatus, type Stage,
} from "@/lib/projects";

type View = "list" | "board" | "timeline";
type Filter = "all" | "hot" | "late" | "stale" | "unpaid";
const newId = () => crypto.randomUUID().slice(0, 8);

// Сначала горящие: по дедлайну (без дедлайна — в конце), потом по приоритету
const byDeadline = (a: Project, b: Project) =>
  (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || b.priority - a.priority || a.created_at.localeCompare(b.created_at);

const isHot = (p: Project) => { const d = daysLeft(p.deadline); return isOpen(p) && d !== null && d <= 3; };
const isLate = (p: Project) => { const d = daysLeft(p.deadline); return isOpen(p) && d !== null && d < 0; };
const owed = (p: Project) => (p.status === "paused" ? 0 : Math.max(0, p.budget - p.paid));

/** Изменение этапов; когда все закрыты, проект в работе уходит на проверку */
const stagesPatch = (p: Project, tasks: Stage[]): Partial<Project> =>
  tasks.length > 0 && tasks.every((t) => t.done) && p.status === "active" ? { tasks, status: "review" } : { tasks };

/** My Projects: проекты с дедлайнами, этапами, временем и деньгами. Видит только владелец */
export function Projects({ userId }: { userId: string }) {
  const sp = useSearchParams();
  const [list, setList] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [view, setView] = useState<View>(() => {
    try { const v = localStorage.getItem("projects:view") as View; return v === "board" || v === "timeline" ? v : "list"; } catch { return "list"; }
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pending = useRef<Map<string, Partial<Project>>>(new Map());
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from("ws_projects").select("*").eq("user_id", userId).order("position").order("created_at"),
        supabase.from("clients").select("username").eq("user_id", userId).neq("username", ""),
      ]);
      setList(((p.data as Project[]) ?? []).map(fix));
      setClients(Array.from(new Set((c.data ?? []).map((x) => (/[./]/.test(x.username) ? x.username : `@${x.username}`)))));
      if (sp.get("new") === "1") setTimeout(() => titleInput.current?.focus(), 50);
    })();
  }, [userId]);

  useEffect(() => { try { localStorage.setItem("projects:view", view); } catch {} }, [view]);

  // Часы идут, только пока запущен таймер
  const running = list?.find((p) => p.timer_started_at) ?? null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running?.id]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2400); };

  // Правки копятся и уходят в базу через полсекунды после последней
  function patch(id: string, change: Partial<Project>) {
    const stamp = new Date().toISOString();
    if (change.status) change.done_at = change.status === "done" ? stamp : null;
    setList((all) => (all ?? []).map((p) => (p.id === id ? { ...p, ...change, updated_at: stamp } : p)));
    pending.current.set(id, { ...pending.current.get(id), ...change });
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(async () => {
      const body = pending.current.get(id);
      pending.current.delete(id);
      const { error } = await supabase.from("ws_projects").update({ ...body, updated_at: stamp }).eq("id", id);
      if (error) flash("Не сохранилось. Проверь интернет.");
    }, 500));
  }

  // Таймер: одновременно идёт только один
  function stopTimer(p: Project) {
    if (p.timer_started_at) patch(p.id, { time_spent: spent(p), timer_started_at: null });
  }
  function startTimer(p: Project) {
    if (running && running.id !== p.id) stopTimer(running);
    patch(p.id, { timer_started_at: new Date().toISOString(), ...(p.status === "idea" ? { status: "active" as const } : {}) });
    setNow(Date.now());
  }
  const toggleTimer = (p: Project) => (p.timer_started_at ? stopTimer(p) : startTimer(p));
  function setStatus(p: Project, status: ProjectStatus) {
    patch(p.id, status === "done" && p.timer_started_at ? { status, time_spent: spent(p), timer_started_at: null } : { status });
  }

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) return titleInput.current?.focus();
    const color = PROJECT_COLORS[(list?.length ?? 0) % PROJECT_COLORS.length];
    const { data, error } = await supabase.from("ws_projects")
      .insert({ title: t.slice(0, 120), start_date: today(), status: "active", color, position: Date.now() / 1000 })
      .select("*").single();
    if (error || !data) return flash("Не получилось создать проект");
    setList((all) => [...(all ?? []), fix(data as Project)]);
    setTitle("");
    setOpenId((data as Project).id);
  }

  async function remove(id: string) {
    setOpenId(null);
    await supabase.from("ws_projects").delete().eq("id", id);
    setList((all) => (all ?? []).filter((p) => p.id !== id));
    flash("Проект удалён");
  }

  async function duplicate(p: Project) {
    const { id: _id, created_at: _c, updated_at: _u, done_at: _d, ...rest } = p;
    const { data } = await supabase.from("ws_projects").insert({
      ...rest, title: `${p.title} (копия)`.slice(0, 120), status: "active", paid: 0, time_spent: 0, timer_started_at: null,
      start_date: today(), deadline: null, tasks: p.tasks.map((t) => ({ ...t, id: newId(), done: false, due: null })), position: Date.now() / 1000,
    }).select("*").single();
    if (!data) return flash("Не получилось скопировать");
    setList((all) => [...(all ?? []), fix(data as Project)]);
    setOpenId((data as Project).id);
    flash("Копия создана: этапы без отметок, без дедлайна");
  }

  async function remind(p: Project) {
    if (!p.deadline) return flash("Сначала поставь дедлайн");
    const { error } = await supabase.from("plan_tasks").insert({
      title: `Дедлайн: ${p.title || "проект"}`.slice(0, 200),
      due_date: p.deadline, priority: Math.max(p.priority, 2),
      notes: [p.client && `Клиент: ${p.client}`, p.link].filter(Boolean).join("\n").slice(0, 4000),
    });
    flash(error ? "Не получилось добавить в Plans" : "Задача на день дедлайна добавлена в Plans");
  }

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? []).filter((p) => !s || [p.title, p.client, p.description, ...p.tasks.map((t) => t.t)].some((x) => x.toLowerCase().includes(s)));
  }, [list, q]);
  const shown = useMemo(() => searched.filter((p) => {
    if (filter === "hot") return isHot(p);
    if (filter === "late") return isLate(p);
    if (filter === "stale") return isOpen(p) && isStale(p);
    if (filter === "unpaid") return owed(p) > 0;
    return true;
  }).sort(byDeadline), [searched, filter]);

  if (!list) return <div className="skeleton profile-skeleton" />;

  const open = list.filter(isOpen);
  const counts = {
    hot: list.filter(isHot).length,
    late: list.filter(isLate).length,
    stale: open.filter(isStale).length,
    unpaid: list.reduce((a, p) => a + owed(p), 0),
  };
  const current = list.find((p) => p.id === openId) ?? null;
  const chip = (f: Filter, label: React.ReactNode, tone = "") => (
    <button type="button" className={`pj-chip ${tone} ${filter === f ? "on" : ""}`} aria-pressed={filter === f}
      onClick={() => setFilter(filter === f ? "all" : f)}>{label}</button>
  );

  return (
    <div className="ws-section pj">
      <div className="pj-top">
        <h1 className="pj-h caps">My <span className="it">Projects</span></h1>
        <div className="pj-chips" role="group" aria-label="Фильтр">
          {chip("all", <><b className="mono">{open.length}</b> в работе</>)}
          {counts.hot > 0 && chip("hot", <><b className="mono">{counts.hot}</b> горят</>, "soon")}
          {counts.late > 0 && chip("late", <><b className="mono">{counts.late}</b> просрочено</>, "late")}
          {counts.stale > 0 && chip("stale", <><b className="mono">{counts.stale}</b> без движения</>, "stale")}
          {counts.unpaid > 0 && chip("unpaid", <>ждём <b className="mono">{rub(counts.unpaid)}</b></>, "money")}
        </div>
      </div>

      {running && (
        <div className="pj-running" role="status">
          <i className="pj-rec" />
          <button type="button" className="pj-running-name" onClick={() => setOpenId(running.id)}>{running.title || "Без названия"}</button>
          <b className="mono">{fmtClock(spent(running, now))}</b>
          <button type="button" className="btn sm" onClick={() => stopTimer(running)}>■ Стоп</button>
        </div>
      )}

      <div className="pj-bar-tools">
        <form className="input pj-quick" onSubmit={create}>
          <span aria-hidden="true">+</span>
          <input ref={titleInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            placeholder="Новый проект и Enter" aria-label="Название нового проекта" />
        </form>
        <div className="input sheet-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: проект, клиент, этап" aria-label="Поиск" /></div>
        <div className="seg small" role="tablist" aria-label="Вид">
          {([["list", "Список"], ["board", "Доска"], ["timeline", "Таймлайн"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="tab" className="seg-item" aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {!list.length ? (
        <div className="pj-empty card">
          <b className="h-md">Проектов пока нет</b>
          <p className="lead small">Впиши название в строку «Новый проект» и нажми Enter. Дедлайн, этапы и бюджет добавишь в карточке.</p>
        </div>
      ) : !shown.length ? (
        <p className="hint">Ничего не нашлось. <button type="button" className="pj-link-btn" onClick={() => { setFilter("all"); setQ(""); }}>Сбросить фильтр</button></p>
      ) : view === "list" ? (
        <TrackList items={shown} now={now} showClosed={showClosed || filter !== "all" || !!q.trim()} onShowClosed={() => setShowClosed((v) => !v)}
          onOpen={setOpenId} onPatch={patch} onStatus={setStatus} onTimer={toggleTimer} />
      ) : view === "board" ? (
        <Board items={shown} onOpen={setOpenId} onMove={(id, status) => { const p = list.find((x) => x.id === id); if (p) setStatus(p, status); }} hideDone={false} />
      ) : (
        <Timeline items={shown} onOpen={setOpenId} />
      )}

      {current && (
        <ProjectDrawer
          key={current.id} p={current} clients={clients} now={now}
          onPatch={(c) => patch(current.id, c)}
          onStatus={(s) => setStatus(current, s)}
          onTimer={() => toggleTimer(current)}
          onRemind={() => remind(current)}
          onDuplicate={() => duplicate(current)}
          onDelete={() => remove(current.id)}
          onClose={() => setOpenId(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** Список по срочности: в строке всё, что нужно для решения «что делать дальше» */
function TrackList({ items, now, showClosed, onShowClosed, onOpen, onPatch, onStatus, onTimer }: {
  items: Project[]; now: number; showClosed: boolean; onShowClosed: () => void;
  onOpen: (id: string) => void; onPatch: (id: string, c: Partial<Project>) => void; onStatus: (p: Project, s: ProjectStatus) => void; onTimer: (p: Project) => void;
}) {
  const groups = BUCKETS.map((b) => ({ ...b, items: items.filter((p) => bucketOf(p) === b.v) })).filter((g) => g.items.length);
  const closed = (b: Bucket) => b === "done" || b === "paused";
  const closedCount = groups.filter((g) => closed(g.v)).reduce((a, g) => a + g.items.length, 0);
  return (
    <div className="pj-track">
      {groups.filter((g) => showClosed || !closed(g.v)).map((g) => (
        <section key={g.v} className={`pj-group g-${g.v}`}>
          <header><span>{g.label}</span><em className="mono">{g.items.length}</em></header>
          {g.items.map((p) => <TrackRow key={p.id} p={p} now={now} onOpen={() => onOpen(p.id)} onPatch={(c) => onPatch(p.id, c)} onStatus={(s) => onStatus(p, s)} onTimer={() => onTimer(p)} />)}
        </section>
      ))}
      {closedCount > 0 && (
        <button type="button" className="pj-link-btn pj-closed-toggle" onClick={onShowClosed}>
          {showClosed ? "Скрыть готовые и на паузе" : `Готовые и на паузе: ${closedCount}`}
        </button>
      )}
    </div>
  );
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function TrackRow({ p, now, onOpen, onPatch, onStatus, onTimer }: {
  p: Project; now: number; onOpen: () => void; onPatch: (c: Partial<Project>) => void; onStatus: (s: ProjectStatus) => void; onTimer: () => void;
}) {
  const st = statusOf(p.status);
  const next = nextStage(p);
  const done = p.tasks.filter((t) => t.done).length;
  const left = owed(p);
  const stale = isOpen(p) && isStale(p);
  const sec = spent(p, now);
  const nextLate = next?.due && next.due < today();
  return (
    <div className={`pj-row ${p.status === "done" ? "is-done" : ""}`} style={{ "--pc": p.color } as React.CSSProperties}
      role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(); }}>
      <span className="pj-st" style={{ "--c": st.c } as React.CSSProperties} onClick={stop}>
        <i />{st.label}
        <select value={p.status} onChange={(e) => onStatus(e.target.value as ProjectStatus)} aria-label="Статус">
          {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </span>

      <span className="pj-main">
        <b><i className="pj-dot" />{p.title || "Без названия"}{p.priority >= 2 && <em className="pj-prio" style={{ color: PRIORITY[p.priority].c }}>{"!".repeat(p.priority)}</em>}
        </b>
        <small>
          <Link href={`/workspace/project/?id=${p.id}`} target="_blank" className="pj-open-pill" title="Журнал проекта в новом окне: что сделано, что надо, заметки" onClick={stop}>Открыть проект ↗</Link>
          {p.client && <span>{p.client}</span>}
          {stale && <span className="pj-stale">без движения {staleDays(p)} дн.</span>}
        </small>
      </span>

      <span className="pj-next" onClick={stop}>
        {next ? (
          <>
            <button type="button" className="chk" aria-pressed={false} aria-label={`Этап «${next.t}» готов`}
              onClick={() => onPatch(stagesPatch(p, p.tasks.map((t) => (t.id === next.id ? { ...t, done: true } : t))))} />
            <span className="pj-next-t"><span>{next.t}</span>{next.due && <small className={nextLate ? "late" : ""}>{fromIso(next.due).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small>}</span>
          </>
        ) : p.tasks.length ? <span className="pj-muted">Все этапы готовы</span> : <button type="button" className="pj-link-btn" onClick={onOpen}>+ этапы</button>}
      </span>

      <span className="pj-prog" title={p.tasks.length ? `Этапов готово: ${done} из ${p.tasks.length}` : ""}>
        {p.tasks.length > 0 && <><span className="pj-bar"><b style={{ width: `${progress(p) * 100}%` }} /></span><small className="mono">{done}/{p.tasks.length}</small></>}
      </span>

      <span className="pj-deadline"><DeadlineChip p={p} /></span>

      <span className="pj-time" onClick={stop}>
        {p.status !== "done" ? (
          <button type="button" className={`pj-timer ${p.timer_started_at ? "on" : ""}`} onClick={onTimer}
            aria-label={p.timer_started_at ? "Остановить таймер" : "Запустить таймер"}>
            <i aria-hidden="true">{p.timer_started_at ? "■" : "▶"}</i><span className="mono">{p.timer_started_at ? fmtClock(sec) : sec ? fmtDur(sec) : "0 мин"}</span>
          </button>
        ) : sec > 0 ? <span className="pj-muted mono">{fmtDur(sec)}</span> : null}
      </span>

      <span className="pj-money-cell mono">
        {left > 0 ? <><small>ждём</small>{rub(left)}</> : p.budget > 0 ? <span className="pj-paid">оплачено</span> : null}
      </span>
    </div>
  );
}

// numeric из Postgres приходит строкой
function fix(p: Project): Project {
  return { ...p, budget: Number(p.budget) || 0, paid: Number(p.paid) || 0, tasks: Array.isArray(p.tasks) ? p.tasks : [], time_spent: Number(p.time_spent) || 0 };
}

function DeadlineChip({ p }: { p: Project }) {
  const d = deadlineInfo(p);
  return <span className={`pj-due ${d.tone}`}>{d.text}</span>;
}

function ProjectCard({ p, onOpen, i }: { p: Project; onOpen: () => void; i: number }) {
  const pr = progress(p);
  const st = p.tasks.length;
  const prio = PRIORITY[p.priority];
  return (
    <article className={`pl-card pj-card ${p.status === "done" ? "is-done" : ""}`} draggable style={{ "--pc": p.color, "--i": Math.min(i, 12) } as React.CSSProperties}
      onDragStart={(e) => { e.dataTransfer.setData("text/project", p.id); e.currentTarget.classList.add("dragging"); }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} tabIndex={0} role="button" aria-label={`Открыть проект ${p.title}`}>
      <div className="pj-card-top">
        <i className="pj-dot" />
        <b>{p.title || "Без названия"}</b>
        {p.priority > 0 && <span className="pj-prio" style={{ color: prio.c }} title={`Приоритет: ${prio.label.toLowerCase()}`}>{"!".repeat(p.priority)}</span>}
      </div>
      {p.client && <span className="pj-client">{p.client}</span>}
      {nextStage(p) && p.status !== "done" && <span className="pj-next-mini">→ {nextStage(p)!.t}</span>}
      <DeadlineChip p={p} />
      {(st > 0 || p.status === "done") && (
        <div className="pj-progress" aria-label={`Готово ${Math.round(pr * 100)}%`}>
          <div className="pj-bar"><b style={{ width: `${pr * 100}%` }} /></div>
          <span className="mono">{st ? `${p.tasks.filter((t) => t.done).length}/${st}` : "100%"}</span>
        </div>
      )}
      {p.budget > 0 && <span className="pj-money mono">{rub(p.paid) || "0 ₽"} <em>из {rub(p.budget)}</em></span>}
      <Link href={`/workspace/project/?id=${p.id}`} target="_blank" className="pj-open-pill" draggable={false}
        onClick={(e) => e.stopPropagation()}>Открыть проект ↗</Link>
    </article>
  );
}

function Board({ items, onOpen, onMove, hideDone }: { items: Project[]; onOpen: (id: string) => void; onMove: (id: string, s: ProjectStatus) => void; hideDone: boolean }) {
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="pipeline pj-board">
      {STATUSES.filter((s) => !(hideDone && s.v === "done")).map((s) => {
        const col = items.filter((p) => p.status === s.v);
        return (
          <section key={s.v} className={`pl-col ${over === s.v ? "over" : ""}`} style={{ "--c": s.c } as React.CSSProperties}
            onDragOver={(e) => { if (!e.dataTransfer.types.includes("text/project")) return; e.preventDefault(); setOver(s.v); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/project"); if (id) onMove(id, s.v); }}>
            <header><i />{s.label}<em className="mono">{col.length}</em></header>
            <div className="pl-cards">
              {col.map((p, i) => <ProjectCard key={p.id} p={p} i={i} onOpen={() => onOpen(p.id)} />)}
              {!col.length && <span className="pl-empty">Перетащи сюда</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Таймлайн: полоса от старта до дедлайна, линия «сегодня», просрочка красным */
function Timeline({ items, onOpen }: { items: Project[]; onOpen: (id: string) => void }) {
  const DAY = 26;
  const td = fromIso(today());
  const dated = items.filter((p) => p.deadline);
  const undated = items.filter((p) => !p.deadline);
  const startOf = (p: Project) => fromIso(p.start_date ?? p.created_at.slice(0, 10));
  const minT = Math.min(addDays(td, -7).getTime(), ...dated.map((p) => startOf(p).getTime()));
  const maxT = Math.max(addDays(td, 35).getTime(), ...dated.map((p) => addDays(fromIso(p.deadline!), 4).getTime()));
  // Не больше полугода, чтобы таблица не разъезжалась
  const from = new Date(Math.max(minT, addDays(td, -60).getTime()));
  const days = Math.min(Math.round((maxT - from.getTime()) / 86400000) + 1, 200);
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const idx = (d: Date) => Math.round((d.getTime() - from.getTime()) / 86400000);
  const todayX = idx(td);
  const width = days * DAY;
  const scroller = useRef<HTMLDivElement>(null);
  // Открываемся на неделе «сегодня», а не на начале самого старого проекта
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, (todayX - 5) * DAY); }, [todayX]);

  return (
    <div className="pj-tl card">
      <div className="pj-tl-scroll" ref={scroller}>
        <div className="pj-tl-grid" style={{ width: width + 220 }}>
          <div className="pj-tl-head">
            <div className="pj-tl-name label">Проект</div>
            <div className="pj-tl-days" style={{ width }}>
              {dayList.map((d, i) => (
                <span key={i} className={`${d.getDay() === 0 || d.getDay() === 6 ? "we" : ""} ${i === todayX ? "td" : ""}`} style={{ width: DAY }}>
                  {d.getDate() === 1 || i === 0 ? <em>{d.toLocaleDateString("ru-RU", { month: "short" })}</em> : null}
                  {d.getDate()}
                </span>
              ))}
            </div>
          </div>
          {dated.map((p) => {
            const s = Math.max(0, idx(startOf(p)));
            const e = Math.min(days - 1, idx(fromIso(p.deadline!)));
            const left = s * DAY, w = Math.max(1, e - s + 1) * DAY;
            const lateDays = isOpen(p) ? Math.max(0, Math.min(todayX, days - 1) - e) : 0;
            return (
              <div key={p.id} className="pj-tl-row">
                <button type="button" className="pj-tl-name" onClick={() => onOpen(p.id)}>
                  <i style={{ background: p.color }} /><span>{p.title || "Без названия"}</span>
                </button>
                <div className="pj-tl-track" style={{ width }}>
                  <button type="button" className={`pj-tl-bar ${p.status === "done" ? "done" : ""}`}
                    style={{ left, width: w, "--pc": p.color } as React.CSSProperties} onClick={() => onOpen(p.id)}
                    title={`${p.title}: ${deadlineInfo(p).text}`}>
                    <b style={{ width: `${progress(p) * 100}%` }} />
                    <span>{statusOf(p.status).label}</span>
                  </button>
                  {lateDays > 0 && <i className="pj-tl-late" style={{ left: left + w, width: lateDays * DAY }} />}
                  {p.tasks.filter((t) => t.due).map((t) => {
                    const x = idx(fromIso(t.due!));
                    if (x < 0 || x >= days) return null;
                    return <i key={t.id} className={`pj-tl-stage ${t.done ? "done" : ""}`} style={{ left: x * DAY + DAY / 2 }} title={t.t} />;
                  })}
                </div>
              </div>
            );
          })}
          {todayX >= 0 && todayX < days && <i className="pj-tl-today" style={{ left: 220 + todayX * DAY + DAY / 2 }} aria-hidden="true" />}
        </div>
      </div>
      {undated.length > 0 && (
        <div className="pj-tl-undated">
          <span className="label">Без дедлайна</span>
          <div>{undated.map((p) => <button key={p.id} type="button" className="pill" style={{ "--c": p.color } as React.CSSProperties} onClick={() => onOpen(p.id)}><i />{p.title || "Без названия"}</button>)}</div>
        </div>
      )}
      {!dated.length && <p className="hint pj-tl-none">Поставь проектам дедлайны, и они появятся на таймлайне.</p>}
    </div>
  );
}

/** Карточка проекта сбоку: всё редактируется на месте и сохраняется само */
function ProjectDrawer({ p, clients, now, onPatch, onStatus, onTimer, onRemind, onDuplicate, onDelete, onClose }: {
  p: Project; clients: string[]; now: number;
  onPatch: (c: Partial<Project>) => void; onStatus: (s: ProjectStatus) => void; onTimer: () => void;
  onRemind: () => void; onDuplicate: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [stage, setStage] = useState("");
  const [stageDue, setStageDue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const pr = progress(p);
  const left = Math.max(0, p.budget - p.paid);
  const sec = spent(p, now);
  const rate = p.budget > 0 && sec >= 600 ? Math.round(p.budget / (sec / 3600)) : 0;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const setTasks = (tasks: Stage[]) => onPatch(stagesPatch(p, tasks));
  const shift = (n: number) => onPatch({ deadline: iso(addDays(p.deadline ? fromIso(p.deadline) : fromIso(today()), n)) });
  const num = (v: string) => Math.max(0, Math.min(1e9, Math.round(Number(v.replace(/\s/g, "").replace(",", ".")) || 0)));
  const addTime = (s: number) => onPatch({ time_spent: Math.max(0, (p.time_spent ?? 0) + s) });

  return (
    <div className="card-drawer-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="card-drawer pj-drawer" role="dialog" aria-label={`Проект ${p.title}`} style={{ "--pc": p.color } as React.CSSProperties}>
        <header className="pj-d-head">
          <input className="pj-title-input" value={p.title} maxLength={120} placeholder="Название проекта" aria-label="Название проекта"
            onChange={(e) => onPatch({ title: e.target.value })} />
          <Link href={`/workspace/project/?id=${p.id}`} target="_blank" className="btn sm pj-open-win">Открыть проект ↗</Link>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>×</button>
        </header>

        <div className="pj-status" role="radiogroup" aria-label="Статус">
          {STATUSES.map((s) => (
            <button key={s.v} type="button" role="radio" aria-checked={p.status === s.v} className={p.status === s.v ? "on" : ""}
              style={{ "--c": s.c } as React.CSSProperties} onClick={() => onStatus(s.v)}><i />{s.label}</button>
          ))}
        </div>

        <div className="pj-facts">
          <label htmlFor="pj-deadline"><span className="label">Дедлайн</span>
            <input id="pj-deadline" className="cd-input" type="date" value={p.deadline ?? ""} onChange={(e) => onPatch({ deadline: e.target.value || null })} />
          </label>
          <label htmlFor="pj-client"><span className="label">Клиент</span>
            <input id="pj-client" className="cd-input" list="pj-clients" value={p.client} maxLength={120} placeholder="@ник или имя" onChange={(e) => onPatch({ client: e.target.value })} />
            <datalist id="pj-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <span className="pj-shift">
            <span className={`pj-due ${deadlineInfo(p).tone}`}>{deadlineInfo(p).text}</span>
            <button type="button" onClick={() => shift(1)}>+1 д</button>
            <button type="button" onClick={() => shift(7)}>+1 нед</button>
            {p.deadline && <button type="button" onClick={() => onPatch({ deadline: null })}>убрать</button>}
          </span>
          <label htmlFor="pj-prio"><span className="label">Приоритет</span>
            <select id="pj-prio" className="mini-select" value={p.priority} onChange={(e) => onPatch({ priority: Number(e.target.value) as Project["priority"] })}>
              {PRIORITY.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
            </select>
          </label>
        </div>

        <section className="pj-block">
          <div className="pj-block-head"><span className="label">Этапы</span><span className="mono pj-pct">{p.tasks.length ? `${p.tasks.filter((t) => t.done).length}/${p.tasks.length} · ${Math.round(pr * 100)}%` : ""}</span></div>
          {p.tasks.length > 0 && <div className="pj-bar big"><b style={{ width: `${pr * 100}%` }} /></div>}
          {!p.tasks.length && (
            <div className="pj-templates">
              <span className="hint">Быстро из шаблона:</span>
              {STAGE_TEMPLATES.map((t) => (
                <button key={t.label} type="button" title={t.stages.join(" → ")} onClick={() => setTasks(t.stages.map((x) => ({ id: newId(), t: x, done: false, due: null })))}>{t.label}</button>
              ))}
            </div>
          )}
          <ul className="pj-stages">
            {p.tasks.map((t, i) => {
              const late = !t.done && t.due && t.due < today();
              return (
                <li key={t.id} className={t.done ? "done" : ""}>
                  <button type="button" className="chk" aria-pressed={t.done} aria-label={t.done ? "Вернуть этап" : "Этап готов"}
                    onClick={() => setTasks(p.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
                  <input value={t.t} maxLength={160} aria-label="Название этапа"
                    onChange={(e) => setTasks(p.tasks.map((x) => (x.id === t.id ? { ...x, t: e.target.value } : x)))} />
                  <input type="date" className={`pj-stage-date ${late ? "late" : ""}`} value={t.due ?? ""} aria-label="Срок этапа"
                    onChange={(e) => setTasks(p.tasks.map((x) => (x.id === t.id ? { ...x, due: e.target.value || null } : x)))} />
                  <span className="order-btns">
                    <button type="button" className="icon-btn sm" aria-label="Выше" disabled={i === 0}
                      onClick={() => { const n = [...p.tasks]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setTasks(n); }}>↑</button>
                    <button type="button" className="icon-btn sm" aria-label="Удалить этап" onClick={() => setTasks(p.tasks.filter((x) => x.id !== t.id))}>×</button>
                  </span>
                </li>
              );
            })}
          </ul>
          <form className="pj-stage-add" onSubmit={(e) => {
            e.preventDefault();
            const t = stage.trim();
            if (!t || p.tasks.length >= 100) return;
            setTasks([...p.tasks, { id: newId(), t: t.slice(0, 160), done: false, due: stageDue || null }]);
            setStage(""); setStageDue("");
          }}>
            <div className="input"><input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Новый этап и Enter" maxLength={160} aria-label="Новый этап" /></div>
            <input type="date" className="pj-stage-date" value={stageDue} onChange={(e) => setStageDue(e.target.value)} aria-label="Срок нового этапа" />
          </form>
        </section>

        <div className="pj-duo">
          <section className="pj-block">
            <span className="label">Время</span>
            <b className="pj-clock mono">{p.timer_started_at ? fmtClock(sec) : fmtDur(sec)}</b>
            <div className="pj-time-btns">
              <button type="button" className={`btn sm ${p.timer_started_at ? "" : "ghost"}`} onClick={onTimer}>{p.timer_started_at ? "■ Стоп" : "▶ Старт"}</button>
              <button type="button" className="btn ghost sm" onClick={() => addTime(900)}>+15 мин</button>
              <button type="button" className="btn ghost sm" onClick={() => addTime(3600)}>+1 ч</button>
            </div>
            {rate > 0 && <span className="hint">≈ {rub(rate)} за час</span>}
          </section>
          <section className="pj-block">
            <span className="label">Деньги</span>
            <div className="pj-money-in">
              <input className="cd-input mono" inputMode="numeric" value={p.budget || ""} placeholder="Бюджет" aria-label="Бюджет, ₽" onChange={(e) => onPatch({ budget: num(e.target.value) })} />
              <input className="cd-input mono" inputMode="numeric" value={p.paid || ""} placeholder="Оплачено" aria-label="Оплачено, ₽" onChange={(e) => onPatch({ paid: num(e.target.value) })} />
            </div>
            {p.budget > 0 && <div className="pj-bar money"><b style={{ width: `${Math.min(1, p.paid / p.budget) * 100}%` }} /></div>}
            {p.budget > 0 && (left > 0
              ? <span className="hint">Ждём {rub(left)} · <button type="button" className="pj-link-btn" onClick={() => onPatch({ paid: p.budget })}>оплачено полностью</button></span>
              : <span className="hint good">Оплачено полностью</span>)}
          </section>
        </div>

        <details className="pj-more" open={!!(p.link || p.description)}>
          <summary>Ссылка, заметки, цвет, старт</summary>
          <label className="cd-field" htmlFor="pj-link"><span className="label">Ссылка</span>
            <input id="pj-link" className="cd-input" value={p.link} maxLength={500} placeholder="Figma, Google Диск, ТЗ" onChange={(e) => onPatch({ link: e.target.value })} />
            {/^https?:\/\/\S+$/i.test(p.link.trim()) && <a className="pj-open" href={p.link.trim()} target="_blank" rel="noopener noreferrer nofollow">Открыть ↗</a>}
          </label>
          <label className="cd-field" htmlFor="pj-desc"><span className="label">Заметки</span>
            <textarea id="pj-desc" className="cd-input" rows={4} value={p.description} maxLength={5000} placeholder="Договорённости, правки, доступы"
              onChange={(e) => onPatch({ description: e.target.value })} />
          </label>
          <div className="pj-more-row">
            <label htmlFor="pj-start"><span className="label">Старт</span>
              <input id="pj-start" className="cd-input" type="date" value={p.start_date ?? ""} onChange={(e) => onPatch({ start_date: e.target.value || null })} />
            </label>
            <div className="pj-colors" role="radiogroup" aria-label="Цвет проекта">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={p.color === c} aria-label={`Цвет ${c}`}
                  className={p.color === c ? "on" : ""} style={{ background: c }} onClick={() => onPatch({ color: c })} />
              ))}
            </div>
          </div>
        </details>

        <footer className="cd-foot pj-foot">
          <button type="button" className="btn ghost sm" onClick={onRemind} disabled={!p.deadline}>Напомнить в Plans</button>
          <button type="button" className="btn ghost sm" onClick={onDuplicate}>Дублировать</button>
          {confirm ? (
            <div className="cm-confirm"><span>Удалить «{p.title || "без названия"}»?</span>
              <button type="button" className="btn danger sm" onClick={onDelete}>Удалить</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Отмена</button>
            </div>
          ) : <button type="button" className="btn ghost sm danger-text" onClick={() => setConfirm(true)}>Удалить</button>}
        </footer>
      </aside>
    </div>
  );
}
