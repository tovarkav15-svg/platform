"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rub } from "@/lib/workspace";
import { PRIORITY, addDays, fromIso, iso, today } from "@/lib/plans";
import {
  PROJECT_COLORS, STATUSES, daysLeft, deadlineInfo, isOpen, progress, statusOf,
  type Project, type ProjectStatus, type Stage,
} from "@/lib/projects";
import { CountUp } from "../CountUp";

type View = "board" | "timeline";
const newId = () => crypto.randomUUID().slice(0, 8);

// Сначала горящие: по дедлайну (без дедлайна — в конце), потом по приоритету
const byDeadline = (a: Project, b: Project) =>
  (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || b.priority - a.priority || a.created_at.localeCompare(b.created_at);

/** My Projects: проекты с дедлайнами, этапами и деньгами. Видит только владелец */
export function Projects({ userId }: { userId: string }) {
  const sp = useSearchParams();
  const [list, setList] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<string[]>([]);
  const [view, setView] = useState<View>(() => {
    try { return (localStorage.getItem("projects:view") as View) || "board"; } catch { return "board"; }
  });
  const [q, setQ] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [toast, setToast] = useState("");
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
      setClients(Array.from(new Set((c.data ?? []).map((x) => `@${x.username}`))));
      if (sp.get("new") === "1") setTimeout(() => titleInput.current?.focus(), 50);
    })();
  }, [userId]);

  useEffect(() => { try { localStorage.setItem("projects:view", view); } catch {} }, [view]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2400); };

  // Правки копятся и уходят в базу через полсекунды после последней
  function patch(id: string, change: Partial<Project>) {
    const now = new Date().toISOString();
    if (change.status) change.done_at = change.status === "done" ? now : null;
    setList((all) => (all ?? []).map((p) => (p.id === id ? { ...p, ...change, updated_at: now } : p)));
    pending.current.set(id, { ...pending.current.get(id), ...change });
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(async () => {
      const body = pending.current.get(id);
      pending.current.delete(id);
      const { error } = await supabase.from("ws_projects").update({ ...body, updated_at: now }).eq("id", id);
      if (error) flash("Не сохранилось. Проверь интернет.");
    }, 500));
  }

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) return titleInput.current?.focus();
    const color = PROJECT_COLORS[(list?.length ?? 0) % PROJECT_COLORS.length];
    const { data, error } = await supabase.from("ws_projects")
      .insert({ title: t.slice(0, 120), deadline: deadline || null, start_date: today(), status: "active", color, position: Date.now() / 1000 })
      .select("*").single();
    if (error || !data) return flash("Не получилось создать проект");
    setList((all) => [...(all ?? []), fix(data as Project)]);
    setTitle(""); setDeadline("");
    setOpenId((data as Project).id);
  }

  async function remove(id: string) {
    setOpenId(null);
    await supabase.from("ws_projects").delete().eq("id", id);
    setList((all) => (all ?? []).filter((p) => p.id !== id));
    flash("Проект удалён");
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

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? [])
      .filter((p) => !hideDone || p.status !== "done")
      .filter((p) => !s || [p.title, p.client, p.description].some((x) => x.toLowerCase().includes(s)))
      .sort(byDeadline);
  }, [list, q, hideDone]);

  if (!list) return <div className="skeleton profile-skeleton" />;

  const open = list.filter(isOpen);
  const burning = open.filter((p) => { const d = daysLeft(p.deadline); return d !== null && d >= 0 && d <= 3; }).length;
  const late = open.filter((p) => { const d = daysLeft(p.deadline); return d !== null && d < 0; }).length;
  const money = list.filter((p) => p.status !== "paused").reduce((a, p) => ({ budget: a.budget + p.budget, paid: a.paid + p.paid }), { budget: 0, paid: 0 });
  const current = list.find((p) => p.id === openId) ?? null;

  return (
    <div className="ws-section pj">
      <header className="pj-head">
        <div>
          <span className="label">My Projects</span>
          <h1 className="h-xl caps">Проекты <span className="it">и</span> дедлайны</h1>
        </div>
      </header>

      <div className="ws-stats">
        <div className="ws-stat"><b><CountUp value={open.length} /></b><span><i style={{ background: "#2F7BFF" }} />активных</span></div>
        <div className="ws-stat"><b><CountUp value={burning} /></b><span><i style={{ background: "#E8B100" }} />горят, 3 дня и меньше</span></div>
        <div className="ws-stat"><b><CountUp value={late} /></b><span><i style={{ background: "#E5484D" }} />просрочено</span></div>
        <div className="ws-stat"><b><CountUp value={money.paid} format={(n) => rub(n)} /></b><span>получено из {rub(money.budget) || "0 ₽"}</span></div>
      </div>

      <form className="pj-new" onSubmit={create}>
        <div className="input pj-new-title">
          <input ref={titleInput} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            placeholder="Новый проект: например, «Сайт для кофейни»" aria-label="Название проекта" />
        </div>
        <label className="input pj-new-date">
          <span className="label">Дедлайн</span>
          <input type="date" value={deadline} min={today()} onChange={(e) => setDeadline(e.target.value)} aria-label="Дедлайн" />
        </label>
        <button type="submit" className="btn" disabled={!title.trim()}>+ Проект</button>
      </form>

      <div className="sheet-toolbar">
        <div className="seg small" role="tablist" aria-label="Вид">
          <button type="button" role="tab" className="seg-item" aria-current={view === "board" ? "page" : undefined} onClick={() => setView("board")}>Доска</button>
          <button type="button" role="tab" className="seg-item" aria-current={view === "timeline" ? "page" : undefined} onClick={() => setView("timeline")}>Таймлайн</button>
        </div>
        <div className="input sheet-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по проектам и клиентам" aria-label="Поиск" /></div>
        <label className="mini-toggle"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Скрыть готовые</label>
      </div>

      {!list.length ? (
        <div className="pj-empty card">
          <b className="h-md caps">Пока <span className="it">пусто</span></b>
          <p className="lead small">Добавь первый проект: название и дедлайн. Этапы, клиента и бюджет можно заполнить потом в карточке.</p>
        </div>
      ) : view === "board" ? (
        <Board items={shown} onOpen={setOpenId} onMove={(id, status) => patch(id, { status })} hideDone={hideDone} />
      ) : (
        <Timeline items={shown} onOpen={setOpenId} />
      )}

      <p className="hint">
        {view === "board"
          ? "Перетаскивай карточки между колонками, чтобы менять статус. Клик открывает проект: дедлайн, этапы, клиент, деньги."
          : "Полоса идёт от старта до дедлайна. Красный хвост — просрочка. Проекты без дедлайна собраны внизу."}
      </p>

      {current && (
        <ProjectDrawer
          key={current.id} p={current} clients={clients}
          onPatch={(c) => patch(current.id, c)}
          onRemind={() => remind(current)}
          onDelete={() => remove(current.id)}
          onClose={() => setOpenId(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// numeric из Postgres приходит строкой
function fix(p: Project): Project {
  return { ...p, budget: Number(p.budget) || 0, paid: Number(p.paid) || 0, tasks: Array.isArray(p.tasks) ? p.tasks : [] };
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
      <DeadlineChip p={p} />
      {(st > 0 || p.status === "done") && (
        <div className="pj-progress" aria-label={`Готово ${Math.round(pr * 100)}%`}>
          <div className="pj-bar"><b style={{ width: `${pr * 100}%` }} /></div>
          <span className="mono">{st ? `${p.tasks.filter((t) => t.done).length}/${st}` : "100%"}</span>
        </div>
      )}
      {p.budget > 0 && <span className="pj-money mono">{rub(p.paid) || "0 ₽"} <em>из {rub(p.budget)}</em></span>}
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
function ProjectDrawer({ p, clients, onPatch, onRemind, onDelete, onClose }: {
  p: Project; clients: string[]; onPatch: (c: Partial<Project>) => void; onRemind: () => void; onDelete: () => void; onClose: () => void;
}) {
  const [stage, setStage] = useState("");
  const [stageDue, setStageDue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const pr = progress(p);
  const d = deadlineInfo(p);
  const left = Math.max(0, p.budget - p.paid);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const setTasks = (tasks: Stage[]) => {
    // Все этапы закрыты — предлагаем статус «На проверке», если проект ещё в работе
    const allDone = tasks.length > 0 && tasks.every((t) => t.done);
    onPatch(allDone && p.status === "active" ? { tasks, status: "review" } : { tasks });
  };
  const shift = (n: number) => onPatch({ deadline: iso(addDays(p.deadline ? fromIso(p.deadline) : fromIso(today()), n)) });
  const num = (v: string) => Math.max(0, Math.min(1e9, Math.round(Number(v.replace(/\s/g, "").replace(",", ".")) || 0)));

  return (
    <div className="card-drawer-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="card-drawer pj-drawer" role="dialog" aria-label={`Проект ${p.title}`} style={{ "--pc": p.color } as React.CSSProperties}>
        <header className="cd-head">
          <span className={`pj-due ${d.tone}`}>{d.text}</span>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>×</button>
        </header>

        <input className="pj-title-input" value={p.title} maxLength={120} placeholder="Название проекта" aria-label="Название проекта"
          onChange={(e) => onPatch({ title: e.target.value })} />

        <div className="pj-status" role="radiogroup" aria-label="Статус">
          {STATUSES.map((s) => (
            <button key={s.v} type="button" role="radio" aria-checked={p.status === s.v} className={p.status === s.v ? "on" : ""}
              style={{ "--c": s.c } as React.CSSProperties} onClick={() => onPatch({ status: s.v })}><i />{s.label}</button>
          ))}
        </div>

        <div className="pj-grid">
          <label className="cd-field" htmlFor="pj-deadline">
            <span className="label">Дедлайн</span>
            <input id="pj-deadline" className="cd-input" type="date" value={p.deadline ?? ""} onChange={(e) => onPatch({ deadline: e.target.value || null })} />
            <span className="pj-shift">
              <button type="button" onClick={() => shift(1)}>+1 день</button>
              <button type="button" onClick={() => shift(7)}>+1 нед</button>
              <button type="button" onClick={() => shift(30)}>+1 мес</button>
              {p.deadline && <button type="button" onClick={() => onPatch({ deadline: null })}>убрать</button>}
            </span>
          </label>
          <label className="cd-field" htmlFor="pj-start">
            <span className="label">Старт</span>
            <input id="pj-start" className="cd-input" type="date" value={p.start_date ?? ""} onChange={(e) => onPatch({ start_date: e.target.value || null })} />
          </label>
        </div>

        <div className="pj-grid">
          <label className="cd-field" htmlFor="pj-client">
            <span className="label">Клиент</span>
            <input id="pj-client" className="cd-input" list="pj-clients" value={p.client} maxLength={120} placeholder="@ник или имя"
              onChange={(e) => onPatch({ client: e.target.value })} />
            <datalist id="pj-clients">{clients.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="cd-field" htmlFor="pj-prio">
            <span className="label">Приоритет</span>
            <select id="pj-prio" className="mini-select" value={p.priority} onChange={(e) => onPatch({ priority: Number(e.target.value) as Project["priority"] })}>
              {PRIORITY.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
            </select>
          </label>
        </div>

        <section className="pj-block">
          <div className="pj-block-head">
            <span className="label">Этапы</span>
            <span className="mono pj-pct">{Math.round(pr * 100)}%</span>
          </div>
          <div className="pj-bar big"><b style={{ width: `${pr * 100}%` }} /></div>
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
            <div className="input"><input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Новый этап: бриф, макет, правки, сдача" maxLength={160} aria-label="Новый этап" /></div>
            <input type="date" className="pj-stage-date" value={stageDue} onChange={(e) => setStageDue(e.target.value)} aria-label="Срок нового этапа" />
            <button type="submit" className="btn ghost sm" disabled={!stage.trim()}>Добавить</button>
          </form>
        </section>

        <section className="pj-block">
          <span className="label">Деньги</span>
          <div className="pj-grid">
            <label className="cd-field" htmlFor="pj-budget">
              <span className="hint">Бюджет, ₽</span>
              <input id="pj-budget" className="cd-input mono" inputMode="numeric" value={p.budget || ""} placeholder="0" onChange={(e) => onPatch({ budget: num(e.target.value) })} />
            </label>
            <label className="cd-field" htmlFor="pj-paid">
              <span className="hint">Оплачено, ₽</span>
              <input id="pj-paid" className="cd-input mono" inputMode="numeric" value={p.paid || ""} placeholder="0" onChange={(e) => onPatch({ paid: num(e.target.value) })} />
            </label>
          </div>
          {p.budget > 0 && (
            <>
              <div className="pj-bar money"><b style={{ width: `${Math.min(1, p.paid / p.budget) * 100}%` }} /></div>
              <span className="hint">{left > 0 ? `Осталось получить ${rub(left)}` : "Оплачено полностью"}</span>
            </>
          )}
        </section>

        <label className="cd-field" htmlFor="pj-link">
          <span className="label">Ссылка</span>
          <input id="pj-link" className="cd-input" value={p.link} maxLength={500} placeholder="Figma, Google Диск, ТЗ" onChange={(e) => onPatch({ link: e.target.value })} />
          {/^https?:\/\/\S+$/i.test(p.link.trim()) && <a className="pj-open" href={p.link.trim()} target="_blank" rel="noopener noreferrer nofollow">Открыть ссылку ↗</a>}
        </label>

        <label className="cd-field" htmlFor="pj-desc">
          <span className="label">Описание и заметки</span>
          <textarea id="pj-desc" className="cd-input" rows={5} value={p.description} maxLength={5000}
            placeholder="Что нужно сделать, договорённости, правки" onChange={(e) => onPatch({ description: e.target.value })} />
        </label>

        <div className="cd-field">
          <span className="label">Цвет</span>
          <div className="pj-colors" role="radiogroup" aria-label="Цвет проекта">
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={p.color === c} aria-label={`Цвет ${c}`}
                className={p.color === c ? "on" : ""} style={{ background: c }} onClick={() => onPatch({ color: c })} />
            ))}
          </div>
        </div>

        <footer className="cd-foot pj-foot">
          <button type="button" className="btn ghost sm" onClick={onRemind} disabled={!p.deadline}>Напомнить в Plans</button>
          {confirm ? (
            <div className="cm-confirm"><span>Удалить проект «{p.title || "без названия"}»?</span>
              <button type="button" className="btn danger sm" onClick={onDelete}>Удалить</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Отмена</button>
            </div>
          ) : <button type="button" className="btn ghost sm danger-text" onClick={() => setConfirm(true)}>Удалить проект</button>}
        </footer>
      </aside>
    </div>
  );
}
