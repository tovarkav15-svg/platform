"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Goal, type Task } from "@/lib/supabase";
import { CountUp } from "../CountUp";

const td = () => new Date().toISOString().slice(0, 10);
const daysLeft = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(td() + "T00:00:00").getTime()) / 86400000);
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const COLORS = ["#7B61FF", "#2F7BFF", "#1FA67A", "#E8B100", "#FF6A3D", "#FF4F8B"];

/** Цели внутри Plans: каждая цель — «вершина» с кольцом прогресса и шагами-задачами */
export function GoalsSpace({ userId }: { userId: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [burst, setBurst] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from("goals").select("*").eq("user_id", userId).order("done").order("created_at"),
      supabase.from("tasks").select("*").eq("user_id", userId).order("done").order("due_date", { nullsFirst: false }).order("created_at"),
    ]);
    setGoals((g as Goal[]) ?? []);
    setTasks((t as Task[]) ?? []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (!goals) return <div className="skeleton profile-skeleton" />;

  const progress = (g: Goal) => {
    const list = tasks.filter((t) => t.goal_id === g.id);
    if (g.done) return 1;
    return list.length ? list.filter((t) => t.done).length / list.length : 0;
  };
  const active = goals.filter((g) => !g.done);
  const avg = active.length ? active.reduce((s, g) => s + progress(g), 0) / active.length : 0;
  const reached = goals.filter((g) => g.done).length;

  async function toggleGoal(g: Goal) {
    if (!g.done) { setBurst(g.id); setTimeout(() => setBurst(null), 1400); }
    await supabase.from("goals").update({ done: !g.done }).eq("id", g.id);
    load();
  }

  return (
    <div className="gs">
      <section className="gs-hero">
        <div className="gs-hero-text">
          <span className="label">Цели · вершины</span>
          <h2 className="caps">Куда <span className="it">ты</span> идёшь</h2>
          <div className="gs-hero-stats">
            <span><b className="mono"><CountUp value={active.length} /></b>в пути</span>
            <span><b className="mono"><CountUp value={reached} /></b>покорено</span>
            <span><b className="mono"><CountUp value={Math.round(avg * 100)} />%</b>средний прогресс</span>
          </div>
        </div>
        <Ridge goals={active.slice(0, 6)} progress={progress} />
      </section>

      <NewGoal onAdded={load} />

      {goals.length ? (
        <div className="gs-grid">
          {goals.map((g, i) => (
            <GoalCard key={g.id} g={g} i={i} color={COLORS[i % COLORS.length]} tasks={tasks.filter((t) => t.goal_id === g.id)}
              pct={progress(g)} bursting={burst === g.id} onToggle={() => toggleGoal(g)} onChange={load} />
          ))}
        </div>
      ) : (
        <div className="gs-empty">
          <p className="lead">Поставь первую цель: «Выйти на 150 000 ₽ в месяц», «Запустить канал», «Собрать команду». Потом разбей её на шаги.</p>
        </div>
      )}
    </div>
  );
}

/** Хребет: высота каждой вершины — прогресс по цели, флажок на покорённых */
function Ridge({ goals, progress }: { goals: Goal[]; progress: (g: Goal) => number }) {
  const W = 360, H = 150, base = 140;
  const n = Math.max(goals.length, 3);
  const peaks = Array.from({ length: n }, (_, i) => {
    const g = goals[i];
    const x = 30 + (i * (W - 60)) / (n - 1);
    const h = g ? 30 + progress(g) * 90 : 18 + (i % 2) * 14;
    return { x, y: base - h, g, color: COLORS[i % COLORS.length] };
  });
  const d = `M0 ${base} ` + peaks.map((p, i) => {
    const prevX = i === 0 ? 0 : (peaks[i - 1].x + p.x) / 2;
    return `L${prevX} ${base - 8} L${p.x} ${p.y}`;
  }).join(" ") + ` L${W} ${base} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gs-ridge" aria-hidden="true">
      <defs>
        <linearGradient id="gsFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c9b8ff" stopOpacity=".55" />
          <stop offset="1" stopColor="#a9d8ff" stopOpacity=".1" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#gsFill)" className="gs-ridge-fill" />
      <path d={d.replace(/ Z$/, "")} className="gs-ridge-line" />
      {peaks.map((p, i) => p.g && (
        <g key={i} className="gs-peak" style={{ "--d": `${i * 120 + 400}ms` } as React.CSSProperties}>
          <circle cx={p.x} cy={p.y} r="5" fill={p.color} stroke="#fff" strokeWidth="2" />
          <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 22} stroke="#141414" strokeWidth="1.5" />
          <path d={`M${p.x} ${p.y - 22} L${p.x + 14} ${p.y - 17} L${p.x} ${p.y - 12} Z`} fill={p.color} className="gs-flag" />
        </g>
      ))}
    </svg>
  );
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const R = 30, C = 2 * Math.PI * R;
  return (
    <span className="gs-ring">
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
        <circle cx="36" cy="36" r={R} className="gs-ring-bg" />
        <circle cx="36" cy="36" r={R} className="gs-ring-fg" stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <b className="mono"><CountUp value={Math.round(pct * 100)} />%</b>
    </span>
  );
}

function GoalCard({ g, i, color, tasks, pct, bursting, onToggle, onChange }: {
  g: Goal; i: number; color: string; tasks: Task[]; pct: number; bursting: boolean; onToggle: () => void; onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const left = g.due_date ? daysLeft(g.due_date) : null;
  const doneCount = tasks.filter((t) => t.done).length;

  const update = async (patch: Partial<Goal>) => { await supabase.from("goals").update(patch).eq("id", g.id); onChange(); };

  return (
    <article className={`gs-card ${g.done ? "done" : ""} ${bursting ? "burst" : ""}`} style={{ "--c": color, "--i": i } as React.CSSProperties}>
      {bursting && <span className="gs-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ "--k": k } as React.CSSProperties} />)}</span>}
      <header className="gs-card-head">
        <Ring pct={pct} color={color} />
        <div className="gs-card-title">
          <h3>{g.title}</h3>
          <span className="gs-meta">
            {g.done ? "Вершина покорена" : left === null ? "Без срока" : left < 0 ? `Просрочено на ${-left} дн.` : left === 0 ? "Срок сегодня" : `Осталось ${left} дн. · до ${shortDate(g.due_date!)}`}
            {" · "}{doneCount}/{tasks.length} шагов
          </span>
        </div>
      </header>

      {tasks.length > 0 && (
        <ol className="gs-steps">
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? "done" : ""}>
              <button type="button" className="gs-step" aria-pressed={t.done} aria-label={t.done ? "Вернуть шаг" : "Шаг выполнен"}
                onClick={async () => { await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id); onChange(); }} />
              <span className="gs-step-title">{t.title}</span>
              {t.due_date && <span className={`due ${!t.done && t.due_date < td() ? "overdue" : ""}`}>{shortDate(t.due_date)}</span>}
              <button type="button" className="icon-btn sm ghosty" aria-label="Удалить шаг"
                onClick={async () => { await supabase.from("tasks").delete().eq("id", t.id); onChange(); }}>×</button>
            </li>
          ))}
        </ol>
      )}

      {!g.done && (
        <form className="gs-add" onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await supabase.from("tasks").insert({ title: title.trim(), goal_id: g.id, due_date: due || null });
          setTitle(""); setDue("");
          onChange();
        }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ следующий шаг" maxLength={160} aria-label="Новый шаг" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок шага" />
        </form>
      )}

      <footer className="gs-card-foot">
        <button type="button" className="chip-btn" onClick={() => update({ is_public: !g.is_public })}>{g.is_public ? "◉ В профиле" : "○ Только я"}</button>
        <button type="button" className={`chip-btn ${g.done ? "" : "go"}`} onClick={onToggle}>{g.done ? "Вернуть в путь" : "Вершина покорена"}</button>
        {confirm
          ? <button type="button" className="chip-btn danger" onClick={async () => { await supabase.from("goals").delete().eq("id", g.id); onChange(); }}>Точно удалить</button>
          : <button type="button" className="chip-btn" onClick={() => setConfirm(true)}>Удалить</button>}
      </footer>
    </article>
  );
}

function NewGoal({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pub, setPub] = useState(false);
  return (
    <form className="gs-new" onSubmit={async (e) => {
      e.preventDefault();
      if (title.trim().length < 2) return;
      await supabase.from("goals").insert({ title: title.trim(), due_date: due || null, is_public: pub });
      setTitle(""); setDue(""); setPub(false);
      onAdded();
    }}>
      <span className="gs-new-flag" aria-hidden="true">⚑</span>
      <input className="gs-new-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Новая вершина: выйти на 150 000 ₽ в месяц" aria-label="Новая цель" />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок цели" />
      <label className="mini-toggle"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> В профиле</label>
      <button className="btn" type="submit" disabled={title.trim().length < 2}>Поставить</button>
    </form>
  );
}
