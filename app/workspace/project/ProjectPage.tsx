"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { rub } from "@/lib/workspace";
import { fromIso, today } from "@/lib/plans";
import {
  STAGE_TEMPLATES, STATUSES, deadlineInfo, fmtClock, fmtDur, progress, spent, statusOf,
  type Project, type ProjectStatus, type Stage,
} from "@/lib/projects";

type Kind = "done" | "todo" | "note" | "issue";
type Entry = { id: string; project_id: string; kind: Kind; text: string; done: boolean; created_at: string };

const KINDS: { v: Kind; label: string; c: string; ph: string }[] = [
  { v: "done", label: "Сделано", c: "#1FA67A", ph: "Что сделал: «Собрал главную, отправил на согласование»" },
  { v: "todo", label: "Надо", c: "#2F7BFF", ph: "Что надо сделать: «Попросить у клиента логотип в SVG»" },
  { v: "note", label: "Заметка", c: "#7B61FF", ph: "Мысль, договорённость, доступы" },
  { v: "issue", label: "Проблема", c: "#E5484D", ph: "Что мешает: «Клиент не отвечает третий день»" },
];
const kindOf = (k: Kind) => KINDS.find((x) => x.v === k)!;
const newId = () => crypto.randomUUID().slice(0, 8);

function fix(p: Project): Project {
  return { ...p, budget: Number(p.budget) || 0, paid: Number(p.paid) || 0, tasks: Array.isArray(p.tasks) ? p.tasks : [], time_spent: Number(p.time_spent) || 0 };
}

function dayTitle(iso: string) {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
}

export function ProjectPage({ userId }: { userId: string }) {
  const id = useSearchParams().get("id") ?? "";
  const [p, setP] = useState<Project | null | undefined>(undefined);
  const [log, setLog] = useState<Entry[]>([]);
  const [kind, setKind] = useState<Kind>("done");
  const [text, setText] = useState("");
  const [show, setShow] = useState<Kind | "all">("all");
  const [stage, setStage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<Partial<Project>>({});
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) { setP(null); return; }
    (async () => {
      const [pr, lg] = await Promise.all([
        supabase.from("ws_projects").select("*").eq("id", id).eq("user_id", userId).maybeSingle(),
        supabase.from("ws_project_log").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(500),
      ]);
      setP(pr.data ? fix(pr.data as Project) : null);
      setLog((lg.data as Entry[]) ?? []);
    })();
  }, [id, userId]);

  useEffect(() => { if (p) document.title = `${p.title || "Проект"} · My Projects`; }, [p?.title]);
  useEffect(() => {
    if (!p?.timer_started_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p?.timer_started_at]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2200); };

  // Правки проекта уходят в базу через полсекунды после последней
  function patch(change: Partial<Project>) {
    if (!p) return;
    const stamp = new Date().toISOString();
    if (change.status) change.done_at = change.status === "done" ? stamp : null;
    setP((cur) => (cur ? { ...cur, ...change, updated_at: stamp } : cur));
    pending.current = { ...pending.current, ...change };
    setSaved("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      const { error } = await supabase.from("ws_projects").update({ ...body, updated_at: stamp }).eq("id", p.id);
      setSaved(error ? "" : "saved");
      if (error) flash("Не сохранилось. Проверь интернет.");
    }, 500);
  }

  async function add(k: Kind, t: string) {
    const body = t.trim().slice(0, 4000);
    if (!body || !p) return;
    const tmp: Entry = { id: `tmp-${newId()}`, project_id: p.id, kind: k, text: body, done: false, created_at: new Date().toISOString() };
    setLog((l) => [tmp, ...l]);
    const { data, error } = await supabase.from("ws_project_log").insert({ project_id: p.id, kind: k, text: body }).select("*").single();
    if (error || !data) { setLog((l) => l.filter((x) => x.id !== tmp.id)); return flash("Запись не сохранилась"); }
    setLog((l) => l.map((x) => (x.id === tmp.id ? (data as Entry) : x)));
    // Любая запись — движение по проекту
    patch({});
  }

  async function updateEntry(e: Entry, change: Partial<Entry>) {
    setLog((l) => l.map((x) => (x.id === e.id ? { ...x, ...change } : x)));
    await supabase.from("ws_project_log").update({ ...change, updated_at: new Date().toISOString() }).eq("id", e.id);
  }
  async function removeEntry(e: Entry) {
    setLog((l) => l.filter((x) => x.id !== e.id));
    await supabase.from("ws_project_log").delete().eq("id", e.id);
  }

  // Отметил этап — в журнал сама падает запись «Сделано»
  function setTasks(tasks: Stage[], closed?: Stage) {
    if (!p) return;
    const allDone = tasks.length > 0 && tasks.every((t) => t.done);
    patch(allDone && p.status === "active" ? { tasks, status: "review" } : { tasks });
    if (closed) add("done", `Этап «${closed.t}» готов`);
  }

  async function toggleTimer() {
    if (!p) return;
    if (p.timer_started_at) return patch({ time_spent: spent(p), timer_started_at: null });
    // Одновременно идёт только один таймер: остальные останавливаем
    const { data: others } = await supabase.from("ws_projects").select("id, time_spent, timer_started_at").eq("user_id", userId).not("timer_started_at", "is", null).neq("id", p.id);
    for (const o of others ?? []) await supabase.from("ws_projects").update({ time_spent: spent({ time_spent: Number(o.time_spent) || 0, timer_started_at: o.timer_started_at }), timer_started_at: null }).eq("id", o.id);
    patch({ timer_started_at: new Date().toISOString() });
    setNow(Date.now());
  }

  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.v, log.filter((e) => e.kind === k.v).length])) as Record<Kind, number>, [log]);
  const openTodos = log.filter((e) => e.kind === "todo" && !e.done);
  const feed = log.filter((e) => (show === "all" ? !(e.kind === "todo" && !e.done) : e.kind === show));
  const days = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of feed) {
      const k = new Date(e.created_at).toDateString();
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()];
  }, [feed]);

  if (p === undefined) return <div className="skeleton profile-skeleton" />;
  if (p === null) return (
    <div className="pjp-missing card">
      <b className="h-md">Проект не найден</b>
      <p className="lead small">Возможно, его удалили или ссылка открыта под другим аккаунтом.</p>
      <Link className="btn" href="/workspace/?tab=projects">К My Projects</Link>
    </div>
  );

  const st = statusOf(p.status);
  const d = deadlineInfo(p);
  const pr = progress(p);
  const sec = spent(p, now);
  const left = Math.max(0, p.budget - p.paid);

  return (
    <div className="pjp" style={{ "--pc": p.color } as React.CSSProperties}>
      <header className="pjp-head">
        <Link href="/workspace/?tab=projects" className="pjp-back">← My Projects</Link>
        <input className="pjp-title" value={p.title} maxLength={120} placeholder="Название проекта" aria-label="Название проекта" onChange={(e) => patch({ title: e.target.value })} />
        <div className="pjp-meta">
          <span className="pj-st" style={{ "--c": st.c } as React.CSSProperties}>
            <i />{st.label}
            <select value={p.status} onChange={(e) => patch(e.target.value === "done" && p.timer_started_at ? { status: "done", time_spent: spent(p), timer_started_at: null } : { status: e.target.value as ProjectStatus })} aria-label="Статус">
              {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </span>
          <label className={`pj-due ${d.tone} pjp-date`}>
            {d.text}
            <input type="date" value={p.deadline ?? ""} onChange={(e) => patch({ deadline: e.target.value || null })} aria-label="Дедлайн" />
          </label>
          {p.client && <span className="pjp-client">{p.client}</span>}
          <button type="button" className={`pj-timer ${p.timer_started_at ? "on" : ""}`} onClick={toggleTimer}>
            <i aria-hidden="true">{p.timer_started_at ? "■" : "▶"}</i><span className="mono">{p.timer_started_at ? fmtClock(sec) : fmtDur(sec)}</span>
          </button>
          {p.budget > 0 && <span className="pjp-money mono">{left > 0 ? `ждём ${rub(left)}` : "оплачено"}</span>}
          <span className="pjp-saved hint">{saved === "saving" ? "Сохраняю…" : saved === "saved" ? "Сохранено" : ""}</span>
        </div>
      </header>

      <div className="pjp-grid">
        <section className="pjp-log">
          <form className="pjp-compose card" onSubmit={(e) => { e.preventDefault(); add(kind, text); setText(""); }}>
            <div className="pjp-kinds" role="radiogroup" aria-label="Тип записи">
              {KINDS.map((k) => (
                <button key={k.v} type="button" role="radio" aria-checked={kind === k.v} className={kind === k.v ? "on" : ""}
                  style={{ "--c": k.c } as React.CSSProperties} onClick={() => { setKind(k.v); input.current?.focus(); }}><i />{k.label}</button>
              ))}
            </div>
            <textarea ref={input} className="pjp-input" rows={3} value={text} maxLength={4000} placeholder={kindOf(kind).ph} aria-label="Новая запись"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); add(kind, text); setText(""); } }} />
            <div className="pjp-compose-foot">
              <span className="hint">Enter — записать, Shift+Enter — новая строка</span>
              <button type="submit" className="btn sm" disabled={!text.trim()}>Записать</button>
            </div>
          </form>

          {openTodos.length > 0 && (
            <div className="pjp-todos card">
              <span className="label">Надо сделать · {openTodos.length}</span>
              <ul>
                {openTodos.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="chk" aria-pressed={false} aria-label="Сделано" onClick={() => updateEntry(e, { done: true })} />
                    <span>{e.text}</span>
                    <button type="button" className="icon-btn sm" aria-label="Удалить" onClick={() => removeEntry(e)}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pjp-filter" role="group" aria-label="Показать">
            <button type="button" className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>Всё</button>
            {KINDS.map((k) => counts[k.v] > 0 && (
              <button key={k.v} type="button" className={show === k.v ? "on" : ""} style={{ "--c": k.c } as React.CSSProperties} onClick={() => setShow(show === k.v ? "all" : k.v)}>
                <i />{k.label} <em className="mono">{counts[k.v]}</em>
              </button>
            ))}
          </div>

          {!log.length ? (
            <p className="pjp-empty hint">Журнал пуст. Записывай сюда, что сделал за день, что осталось и что мешает: так через неделю будет видно, где проект.</p>
          ) : days.map((items) => (
            <div key={items[0].created_at} className="pjp-day">
              <span className="pjp-day-t label">{dayTitle(items[0].created_at)}</span>
              {items.map((e) => <LogItem key={e.id} e={e} onToggle={() => updateEntry(e, { done: !e.done })} onEdit={(t) => updateEntry(e, { text: t })} onRemove={() => removeEntry(e)} />)}
            </div>
          ))}
        </section>

        <aside className="pjp-side">
          <section className="pj-block">
            <div className="pj-block-head"><span className="label">Этапы</span><span className="mono pj-pct">{p.tasks.length ? `${p.tasks.filter((t) => t.done).length}/${p.tasks.length}` : ""}</span></div>
            {p.tasks.length > 0 && <div className="pj-bar big"><b style={{ width: `${pr * 100}%` }} /></div>}
            {!p.tasks.length && (
              <div className="pj-templates">
                <span className="hint">Шаблон:</span>
                {STAGE_TEMPLATES.map((t) => (
                  <button key={t.label} type="button" title={t.stages.join(" → ")} onClick={() => setTasks(t.stages.map((x) => ({ id: newId(), t: x, done: false, due: null })))}>{t.label}</button>
                ))}
              </div>
            )}
            <ul className="pjp-stages">
              {p.tasks.map((t) => {
                const late = !t.done && t.due && t.due < today();
                return (
                  <li key={t.id} className={t.done ? "done" : ""}>
                    <button type="button" className="chk" aria-pressed={t.done} aria-label={t.done ? "Вернуть этап" : "Этап готов"}
                      onClick={() => setTasks(p.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)), t.done ? undefined : t)} />
                    <span>{t.t}</span>
                    {t.due && <small className={late ? "late" : ""}>{fromIso(t.due).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</small>}
                  </li>
                );
              })}
            </ul>
            <form className="pj-stage-add" onSubmit={(e) => { e.preventDefault(); const t = stage.trim(); if (t) { setTasks([...p.tasks, { id: newId(), t: t.slice(0, 160), done: false, due: null }]); setStage(""); } }}>
              <div className="input"><input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="Новый этап и Enter" maxLength={160} aria-label="Новый этап" /></div>
            </form>
          </section>

          <section className="pj-block">
            <span className="label">Заметки по проекту</span>
            <textarea className="cd-input pjp-notes" rows={10} value={p.description} maxLength={5000}
              placeholder="ТЗ, договорённости, доступы, контакты — всё, что держать под рукой" onChange={(e) => patch({ description: e.target.value })} />
            <input className="cd-input" value={p.link} maxLength={500} placeholder="Ссылка: Figma, Диск, ТЗ" aria-label="Ссылка" onChange={(e) => patch({ link: e.target.value })} />
            {/^https?:\/\/\S+$/i.test(p.link.trim()) && <a className="pj-open" href={p.link.trim()} target="_blank" rel="noopener noreferrer nofollow">Открыть ссылку ↗</a>}
          </section>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function LogItem({ e, onToggle, onEdit, onRemove }: { e: Entry; onToggle: () => void; onEdit: (t: string) => void; onRemove: () => void }) {
  const k = kindOf(e.kind);
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(e.text);
  const save = () => { setEdit(false); const t = val.trim(); if (t && t !== e.text) onEdit(t.slice(0, 4000)); else setVal(e.text); };
  return (
    <article className={`pjp-item k-${e.kind} ${e.done ? "is-done" : ""}`} style={{ "--c": k.c } as React.CSSProperties}>
      {e.kind === "todo"
        ? <button type="button" className="chk" aria-pressed={e.done} aria-label={e.done ? "Вернуть" : "Сделано"} onClick={onToggle} />
        : <i className="pjp-dot" aria-hidden="true" />}
      <div className="pjp-item-body">
        <span className="pjp-item-meta"><b>{k.label}</b> · {new Date(e.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
        {edit ? (
          <textarea className="cd-input" autoFocus rows={3} value={val} onChange={(ev) => setVal(ev.target.value)} onBlur={save}
            onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); save(); } if (ev.key === "Escape") { setVal(e.text); setEdit(false); } }} />
        ) : <p onDoubleClick={() => setEdit(true)}>{e.text}</p>}
      </div>
      <span className="pjp-item-actions">
        <button type="button" className="icon-btn sm" aria-label="Изменить" onClick={() => setEdit(true)}>✎</button>
        <button type="button" className="icon-btn sm" aria-label="Удалить" onClick={onRemove}>×</button>
      </span>
    </article>
  );
}
