"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACCENTS, accentColor } from "@/lib/style";
import {
  PRIORITY, REPEATS, SMART, addDays, dueLabel, groupTasks, inSmart, iso, nextDue, parseQuick, today,
  type PlanList, type PlanTask, type Repeat, type SmartId, type Subtask,
} from "@/lib/plans";

type Scope = { kind: "smart"; id: SmartId } | { kind: "list"; id: string } | { kind: "tag"; id: string };
type ViewMode = "list" | "matrix" | "calendar";

export function Plans({ userId }: { userId: string }) {
  const [lists, setLists] = useState<PlanList[]>([]);
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [scope, setScope] = useState<Scope>({ kind: "smart", id: "today" });
  const [mode, setMode] = useState<ViewMode>("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([
      supabase.from("plan_lists").select("*").eq("user_id", userId).order("position").order("created_at"),
      supabase.from("plan_tasks").select("*").eq("user_id", userId).order("position"),
    ]);
    setLists((l.data as PlanList[]) ?? []);
    setTasks((t.data as PlanTask[]) ?? []);
  }, [userId]);

  useEffect(() => {
    load();
    try {
      const saved = JSON.parse(localStorage.getItem("plans:ui") ?? "{}");
      if (saved.mode) setMode(saved.mode);
      if (saved.scope) setScope(saved.scope);
    } catch {}
  }, [load]);

  useEffect(() => { try { localStorage.setItem("plans:ui", JSON.stringify({ mode, scope })); } catch {} }, [mode, scope]);

  const all = tasks ?? [];
  const tags = useMemo(() => [...new Set(all.flatMap((t) => (t.done ? [] : t.tags)))].sort(), [all]);

  const visible = useMemo(() => all.filter((t) => {
    if (scope.kind === "smart") return inSmart(t, scope.id);
    if (scope.kind === "list") return t.list_id === scope.id && (mode !== "list" ? !t.done : true);
    return t.tags.includes(scope.id) && !t.done;
  }), [all, scope, mode]);

  const count = (s: Scope) => all.filter((t) => !t.done && (s.kind === "smart" ? inSmart(t, s.id) : s.kind === "list" ? t.list_id === s.id : t.tags.includes(s.id))).length;
  const title = scope.kind === "smart" ? SMART.find((x) => x.id === scope.id)!.label : scope.kind === "list" ? lists.find((l) => l.id === scope.id)?.name ?? "Список" : `#${scope.id}`;

  const patchLocal = (id: string, patch: Partial<PlanTask>) => setTasks((p) => (p ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)));

  async function update(id: string, patch: Partial<PlanTask>) {
    patchLocal(id, patch);
    await supabase.from("plan_tasks").update(patch).eq("id", id);
  }

  async function toggle(t: PlanTask) {
    // Повторяющаяся задача не закрывается, а переезжает на следующую дату — как в TickTick
    if (!t.done && t.repeat && t.due_date) {
      const due = nextDue(t.due_date, t.repeat);
      await update(t.id, { due_date: due, subtasks: t.subtasks.map((s) => ({ ...s, done: false })) });
      setToast({ text: `Готово. Следующий раз: ${dueLabel(due, t.due_time)}`, undo: () => update(t.id, { due_date: t.due_date }) });
      return;
    }
    const done = !t.done;
    await update(t.id, { done, done_at: done ? new Date().toISOString() : null });
    if (done) setToast({ text: "Задача выполнена", undo: () => update(t.id, { done: false, done_at: null }) });
  }

  async function addTask(raw: string, extra: Partial<PlanTask> = {}) {
    const p = parseQuick(raw);
    if (!p.title) return;
    let listId: string | null = scope.kind === "list" ? scope.id : null;
    if (p.listName) {
      const found = lists.find((l) => l.name.toLowerCase().startsWith(p.listName!.toLowerCase()));
      if (found) listId = found.id;
    }
    const defaultDate = scope.kind === "smart" && (scope.id === "today" || scope.id === "week") ? today() : scope.kind === "smart" && scope.id === "tomorrow" ? iso(addDays(new Date(), 1)) : null;
    const row = {
      title: p.title, list_id: listId, due_date: p.due_date ?? defaultDate, due_time: p.due_time,
      priority: p.priority, tags: [...new Set([...p.tags, ...(scope.kind === "tag" ? [scope.id] : [])])], repeat: p.repeat,
      position: Date.now() / 1000, ...extra,
    };
    const { data } = await supabase.from("plan_tasks").insert(row).select("*").single();
    if (data) setTasks((prev) => [...(prev ?? []), data as PlanTask]);
  }

  async function remove(t: PlanTask) {
    setTasks((p) => (p ?? []).filter((x) => x.id !== t.id));
    setOpenId(null);
    await supabase.from("plan_tasks").delete().eq("id", t.id);
    setToast({
      text: "Задача удалена",
      undo: async () => {
        const { data } = await supabase.from("plan_tasks").insert(t).select("*").single();
        if (data) setTasks((p) => [...(p ?? []), data as PlanTask]);
      },
    });
  }

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id); }, [toast]);

  const open = all.find((t) => t.id === openId) ?? null;
  const td = today();
  const todayAll = all.filter((t) => t.due_date === td || (t.done && t.done_at?.slice(0, 10) === td) || (!t.done && !!t.due_date && t.due_date < td));
  const todayDone = todayAll.filter((t) => t.done).length;

  if (!tasks) return <div className="skeleton profile-skeleton" />;

  return (
    <div className={`plans ${open ? "with-detail" : ""}`}>
      <aside className={`plans-side ${sideOpen ? "open" : ""}`}>
        <nav className="plans-nav" aria-label="Списки">
          {SMART.map((s) => (
            <ScopeBtn key={s.id} active={scope.kind === "smart" && scope.id === s.id} label={s.label} icon={s.id}
              count={s.id === "done" ? undefined : count({ kind: "smart", id: s.id })}
              onClick={() => { setScope({ kind: "smart", id: s.id }); setSideOpen(false); }} />
          ))}
        </nav>
        <ListsBlock lists={lists} scope={scope} count={count} userId={userId} onPick={(id) => { setScope({ kind: "list", id }); setSideOpen(false); }} onChange={load} />
        {tags.length > 0 && (
          <div className="plans-group">
            <div className="label">Теги</div>
            {tags.map((t) => (
              <ScopeBtn key={t} active={scope.kind === "tag" && scope.id === t} label={`#${t}`} count={count({ kind: "tag", id: t })}
                onClick={() => { setScope({ kind: "tag", id: t }); setSideOpen(false); }} />
            ))}
          </div>
        )}
      </aside>

      <section className="plans-main">
        <PlannerDay done={todayDone} total={todayAll.length} />
        <header className="plans-head">
          <button type="button" className="icon-btn plans-burger" onClick={() => setSideOpen((v) => !v)} aria-label="Списки">≡</button>
          <h2 className="h-md caps">{title}</h2>
          <div className="seg small" role="tablist" aria-label="Вид">
            {(["list", "matrix", "calendar"] as ViewMode[]).map((m) => (
              <button key={m} type="button" role="tab" className="seg-item" aria-current={mode === m ? "page" : undefined} onClick={() => setMode(m)}>
                {{ list: "Список", matrix: "Матрица", calendar: "Календарь" }[m]}
              </button>
            ))}
          </div>
        </header>

        {mode !== "calendar" && <QuickAdd onAdd={(raw) => addTask(raw)} />}

        {mode === "list" && (
          <div key={`list-${JSON.stringify(scope)}`} className="plans-view">{visible.length ? groupTasks(visible).map((g) => (
            <div key={g.id} className={`plan-group g-${g.id}`}>
              <div className="plan-group-head"><span>{g.label}</span><em>{g.items.length}</em></div>
              <ul className="plan-tasks">
                {g.items.map((t, i) => (
                  <TaskRow key={t.id} t={t} i={i} active={openId === t.id} list={lists.find((l) => l.id === t.list_id)}
                    onToggle={() => toggle(t)} onOpen={() => setOpenId(t.id)} />
                ))}
              </ul>
            </div>
          )) : <EmptyPlans scope={scope} />}</div>
        )}

        <div key={`mc-${mode}-${JSON.stringify(scope)}`} className="plans-view" hidden={mode === "list"}>
        {mode === "matrix" && <Matrix tasks={visible.filter((t) => !t.done)} onToggle={toggle} onOpen={setOpenId} onMove={(id, priority) => update(id, { priority })} />}
        {mode === "calendar" && <Calendar tasks={all.filter((t) => scope.kind === "smart" ? true : visible.includes(t))} onOpen={setOpenId} onAdd={(date, title) => addTask(title, { due_date: date })} onMove={(id, date) => update(id, { due_date: date })} />}
        </div>
      </section>

      {open && (
        <TaskDetail key={open.id} t={open} lists={lists} onClose={() => setOpenId(null)}
          onToggle={() => toggle(open)} onChange={(patch) => update(open.id, patch)} onDelete={() => remove(open)} />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.undo && <button type="button" onClick={() => { toast.undo?.(); setToast(null); }}>Отменить</button>}
        </div>
      )}
    </div>
  );
}

function PlannerDay({ done, total }: { done: number; total: number }) {
  const now = new Date();
  const pct = total ? done / total : 0;
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div className="planner-day">
      <span className="pd-num">{now.getDate()}</span>
      <span className="pd-when">
        <b className="caps">{now.toLocaleDateString("ru-RU", { weekday: "long" })}</b>
        <em className="it">{now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</em>
      </span>
      <span className="pd-ring" title={`Сегодня выполнено ${done} из ${total}`}>
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r={R} className="ring-bg" />
          <circle cx="32" cy="32" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <span className="mono">{done}/{total}</span>
      </span>
      <span className="pd-caption">{total === 0 ? "На сегодня задач нет" : done === total ? "День закрыт" : `Осталось ${total - done}`}</span>
    </div>
  );
}

const ICONS: Record<string, string> = { today: "◐", tomorrow: "→", week: "7", inbox: "▤", all: "∞", done: "✓" };

function ScopeBtn({ active, label, count, icon, color, onClick }: { active: boolean; label: string; count?: number; icon?: string; color?: string; onClick: () => void }) {
  return (
    <button type="button" className={`scope ${active ? "on" : ""}`} onClick={onClick}>
      {color ? <i className="dot" style={{ background: color }} /> : <i className="scope-ico">{icon ? ICONS[icon] : "#"}</i>}
      <span>{label}</span>
      {!!count && <em>{count}</em>}
    </button>
  );
}

function ListsBlock({ lists, scope, count, userId, onPick, onChange }: {
  lists: PlanList[]; scope: Scope; count: (s: Scope) => number; userId: string; onPick: (id: string) => void; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("ai");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="plans-group">
      <div className="label row-between">Списки <button type="button" className="link-btn" onClick={() => setAdding((v) => !v)}>{adding ? "Отмена" : "+ Список"}</button></div>
      {lists.map((l) => editing === l.id ? (
        <ListEditor key={l.id} list={l} onDone={() => { setEditing(null); onChange(); }} />
      ) : (
        <div key={l.id} className="scope-row" onDoubleClick={() => setEditing(l.id)}>
          <ScopeBtn active={scope.kind === "list" && scope.id === l.id} label={l.name} color={accentColor(l.color)} count={count({ kind: "list", id: l.id })} onClick={() => onPick(l.id)} />
          <button type="button" className="icon-btn sm ghosty" onClick={() => setEditing(l.id)} aria-label={`Изменить список ${l.name}`}>…</button>
        </div>
      ))}
      {adding && (
        <form className="list-form" onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await supabase.from("plan_lists").insert({ user_id: userId, name: name.trim(), color, position: lists.length + 1 });
          setName(""); setAdding(false); onChange();
        }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Название списка" maxLength={40} aria-label="Название списка" />
          <ColorDots value={color} onChange={setColor} />
          <button type="submit" className="btn sm" disabled={!name.trim()}>Создать</button>
        </form>
      )}
    </div>
  );
}

function ListEditor({ list, onDone }: { list: PlanList; onDone: () => void }) {
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const [confirm, setConfirm] = useState(false);
  return (
    <form className="list-form" onSubmit={async (e) => { e.preventDefault(); await supabase.from("plan_lists").update({ name: name.trim() || list.name, color }).eq("id", list.id); onDone(); }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Название списка" />
      <ColorDots value={color} onChange={setColor} />
      <div className="row-between">
        {confirm
          ? <button type="button" className="btn danger sm" onClick={async () => { await supabase.from("plan_lists").delete().eq("id", list.id); onDone(); }}>Удалить с задачами</button>
          : <button type="button" className="link-btn" onClick={() => setConfirm(true)}>Удалить</button>}
        <button type="submit" className="btn sm">Сохранить</button>
      </div>
    </form>
  );
}

function ColorDots({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-dots">
      {Object.entries(ACCENTS).map(([id, a]) => (
        <button key={id} type="button" className={value === id ? "on" : ""} style={{ background: a.color }} onClick={() => onChange(id)} aria-label={a.title} />
      ))}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (raw: string) => void }) {
  const [v, setV] = useState("");
  const parsed = v.trim() ? parseQuick(v) : null;
  return (
    <form className="quick-add" onSubmit={(e) => { e.preventDefault(); if (parsed?.title) { onAdd(v); setV(""); } }}>
      <span className="qa-plus">+</span>
      <input value={v} onChange={(e) => setV(e.target.value)} aria-label="Новая задача"
        placeholder="Добавить задачу: «Созвон с клиентом завтра в 15:00 !3 #продажи»" />
      {parsed && parsed.chips.length > 0 && (
        <div className="qa-chips">{parsed.chips.map((c) => <span key={c}>{c}</span>)}</div>
      )}
    </form>
  );
}

function TaskRow({ t, i, active, list, onToggle, onOpen }: { t: PlanTask; i: number; active: boolean; list?: PlanList; onToggle: () => void; onOpen: () => void }) {
  const [completing, setCompleting] = useState(false);
  const finish = () => {
    if (t.done) return onToggle();
    setCompleting(true);
    setTimeout(() => { setCompleting(false); onToggle(); }, 420);
  };
  const overdue = !t.done && !!t.due_date && t.due_date < today();
  const subDone = t.subtasks.filter((s) => s.done).length;
  return (
    <li className={`plan-task ${t.done ? "done" : ""} ${active ? "active" : ""} ${completing ? "completing" : ""}`} style={{ "--i": i, "--p": PRIORITY[t.priority].c } as React.CSSProperties}>
      <button type="button" className={`pchk p${t.priority}`} aria-pressed={t.done || completing} onClick={finish} aria-label={t.done ? "Вернуть" : "Выполнить"} />
      <button type="button" className="plan-task-body" onClick={onOpen}>
        <span className="plan-task-title">{t.title}</span>
        <span className="plan-task-meta">
          {t.subtasks.length > 0 && <span className="meta-sub">☰ {subDone}/{t.subtasks.length}</span>}
          {t.notes && <span className="meta-sub">✎</span>}
          {t.tags.map((g) => <span key={g} className="meta-tag">#{g}</span>)}
          {list && <span className="meta-list"><i style={{ background: accentColor(list.color) }} />{list.name}</span>}
          {t.repeat && <span className="meta-sub" title="Повторяется">↻</span>}
          {t.due_date && <span className={`meta-date ${overdue ? "overdue" : ""}`}>{dueLabel(t.due_date, t.due_time)}</span>}
        </span>
      </button>
    </li>
  );
}

function TaskDetail({ t, lists, onClose, onToggle, onChange, onDelete }: {
  t: PlanTask; lists: PlanList[]; onClose: () => void; onToggle: () => void; onChange: (p: Partial<PlanTask>) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(t.title);
  const [notes, setNotes] = useState(t.notes);
  const [sub, setSub] = useState("");
  const [tag, setTag] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (patch: Partial<PlanTask>) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onChange(patch), 450); };
  const setSubs = (subtasks: Subtask[]) => onChange({ subtasks });

  return (
    <aside className="plan-detail" aria-label="Задача">
      <header className="pd-head">
        <button type="button" className={`pchk p${t.priority}`} aria-pressed={t.done} onClick={onToggle} aria-label="Выполнить" />
        <input type="date" value={t.due_date ?? ""} onChange={(e) => onChange({ due_date: e.target.value || null })} aria-label="Дата" />
        <input type="time" value={t.due_time?.slice(0, 5) ?? ""} onChange={(e) => onChange({ due_time: e.target.value || null, due_date: t.due_date ?? today() })} aria-label="Время" />
        <span className="pd-flags" role="radiogroup" aria-label="Приоритет">
          {PRIORITY.map((p) => (
            <button key={p.v} type="button" role="radio" aria-checked={t.priority === p.v} title={p.label}
              className={t.priority === p.v ? "on" : ""} style={{ "--p": p.c } as React.CSSProperties}
              onClick={() => onChange({ priority: p.v })}>⚑</button>
          ))}
        </span>
        <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Закрыть">×</button>
      </header>

      <textarea className="pd-title" value={title} rows={1} maxLength={200}
        onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) later({ title: e.target.value.trim() }); }} aria-label="Название" />

      <div className="pd-subs">
        {t.subtasks.map((s, i) => (
          <div key={s.id} className={`pd-sub ${s.done ? "done" : ""}`}>
            <button type="button" className="chk" aria-pressed={s.done} onClick={() => setSubs(t.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} aria-label="Подзадача выполнена" />
            <input value={s.t} onChange={(e) => setSubs(t.subtasks.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} aria-label="Подзадача" />
            <button type="button" className="icon-btn sm ghosty" onClick={() => setSubs(t.subtasks.filter((_, j) => j !== i))} aria-label="Удалить подзадачу">×</button>
          </div>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); if (sub.trim()) { setSubs([...t.subtasks, { id: crypto.randomUUID().slice(0, 8), t: sub.trim(), done: false }]); setSub(""); } }}>
          <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="+ Подзадача" maxLength={120} aria-label="Новая подзадача" />
        </form>
      </div>

      <textarea className="pd-notes" value={notes} placeholder="Заметки" rows={5} maxLength={4000}
        onChange={(e) => { setNotes(e.target.value); later({ notes: e.target.value }); }} aria-label="Заметки" />

      <div className="pd-row">
        <label>Список
          <select value={t.list_id ?? ""} onChange={(e) => onChange({ list_id: e.target.value || null })}>
            <option value="">Входящие</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Повтор
          <select value={t.repeat} onChange={(e) => onChange({ repeat: e.target.value as Repeat, due_date: t.due_date ?? today() })}>
            {REPEATS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
      </div>

      <div className="pd-tags">
        {t.tags.map((g) => (
          <span key={g} className="meta-tag">#{g}<button type="button" onClick={() => onChange({ tags: t.tags.filter((x) => x !== g) })} aria-label={`Убрать тег ${g}`}>×</button></span>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); const v = tag.trim().replace(/^#/, "").toLowerCase(); if (v && !t.tags.includes(v)) onChange({ tags: [...t.tags, v] }); setTag(""); }}>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ тег" maxLength={30} aria-label="Новый тег" />
        </form>
      </div>

      <footer className="pd-foot">
        <span className="hint">Создана {new Date(t.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>
        <button type="button" className="link-btn danger-text" onClick={onDelete}>Удалить задачу</button>
      </footer>
    </aside>
  );
}

// Матрица Эйзенхауэра: четыре квадранта по приоритету, задачи можно перетаскивать
const QUADS = [
  { p: 3, title: "Срочно и важно", c: "#E5484D" },
  { p: 2, title: "Не срочно, но важно", c: "#E8B100" },
  { p: 1, title: "Срочно, не важно", c: "#2F7BFF" },
  { p: 0, title: "Не срочно и не важно", c: "#8A8A87" },
] as const;

function Matrix({ tasks, onToggle, onOpen, onMove }: { tasks: PlanTask[]; onToggle: (t: PlanTask) => void; onOpen: (id: string) => void; onMove: (id: string, p: 0 | 1 | 2 | 3) => void }) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="matrix">
      {QUADS.map((q) => {
        const items = tasks.filter((t) => t.priority === q.p);
        return (
          <section key={q.p} className={`quad ${over === q.p ? "over" : ""}`} style={{ "--p": q.c } as React.CSSProperties}
            onDragOver={(e) => { e.preventDefault(); setOver(q.p); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/task"); if (id) onMove(id, q.p as 0 | 1 | 2 | 3); }}>
            <header><i />{q.title}<em>{items.length}</em></header>
            <ul>
              {items.map((t) => (
                <li key={t.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/task", t.id); e.currentTarget.classList.add("dragging"); }} onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}>
                  <button type="button" className={`pchk p${t.priority}`} aria-pressed={false} onClick={() => onToggle(t)} aria-label="Выполнить" />
                  <button type="button" className="quad-title" onClick={() => onOpen(t.id)}>{t.title}</button>
                  {t.due_date && <span className={`meta-date ${t.due_date < today() ? "overdue" : ""}`}>{dueLabel(t.due_date)}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Calendar({ tasks, onOpen, onAdd, onMove }: { tasks: PlanTask[]; onOpen: (id: string) => void; onAdd: (date: string, title: string) => void; onMove: (id: string, date: string) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [adding, setAdding] = useState<string | null>(null);
  const [text, setText] = useState("");
  const start = addDays(month, -((month.getDay() + 6) % 7)); // с понедельника
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const td = today();
  const byDay = new Map<string, PlanTask[]>();
  tasks.forEach((t) => { if (t.due_date) byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]); });

  return (
    <div className="calendar">
      <div className="cal-head">
        <button type="button" className="icon-btn sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Предыдущий месяц">‹</button>
        <b className="caps">{month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</b>
        <button type="button" className="icon-btn sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Следующий месяц">›</button>
        <button type="button" className="chip-btn" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Сегодня</button>
      </div>
      <div className="cal-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => <div key={d} className="cal-wd">{d}</div>)}
        {days.map((d) => {
          const key = iso(d);
          const items = (byDay.get(key) ?? []).sort((a, b) => Number(a.done) - Number(b.done) || b.priority - a.priority);
          return (
            <div key={key} className={`cal-day ${d.getMonth() !== month.getMonth() ? "muted" : ""} ${key === td ? "today" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { const id = e.dataTransfer.getData("text/task"); if (id) onMove(id, key); }}
              onDoubleClick={() => setAdding(key)}>
              <span className="cal-num">{d.getDate()}</span>
              {items.slice(0, 4).map((t) => (
                <button key={t.id} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                  className={`cal-task ${t.done ? "done" : ""}`} style={{ "--p": PRIORITY[t.priority].c } as React.CSSProperties} onClick={() => onOpen(t.id)}>
                  {t.due_time && <em>{t.due_time.slice(0, 5)}</em>}{t.title}
                </button>
              ))}
              {items.length > 4 && <span className="cal-more">ещё {items.length - 4}</span>}
              {adding === key ? (
                <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAdd(key, text); setText(""); setAdding(null); }}>
                  <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setAdding(null)} placeholder="Задача" aria-label="Новая задача" />
                </form>
              ) : <button type="button" className="cal-add" onClick={() => setAdding(key)} aria-label={`Добавить задачу на ${d.getDate()}`}>+</button>}
            </div>
          );
        })}
      </div>
      <p className="hint">Двойной клик по дню — новая задача. Задачи можно перетаскивать между днями.</p>
    </div>
  );
}

function EmptyPlans({ scope }: { scope: Scope }) {
  const text = scope.kind === "smart" && scope.id === "today"
    ? "На сегодня всё чисто. Добавь задачу выше или загляни во «Входящие»."
    : scope.kind === "smart" && scope.id === "done" ? "Здесь появятся выполненные задачи." : "Задач нет. Добавь первую строкой выше.";
  return <div className="empty plans-empty"><p className="lead">{text}</p><p className="hint">Подсказка: «завтра в 10:00», «пт», «12.10», «!3» — приоритет, «#тег», «~Список», «каждую неделю».</p></div>;
}

