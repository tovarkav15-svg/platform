"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Goal, type Task } from "@/lib/supabase";

const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

function dueClass(d: string | null, done: boolean) {
  if (!d || done) return "";
  if (d < today()) return "overdue";
  if (d === today()) return "today";
  return "";
}

/** Цели с задачами. editable — свои цели на /goals, иначе только открытые цели в профиле */
export function GoalsBoard({ userId, editable }: { userId: string; editable: boolean }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    let gq = supabase.from("goals").select("*").eq("user_id", userId).order("done").order("created_at");
    if (!editable) gq = gq.eq("is_public", true);
    const [{ data: g }, { data: t }] = await Promise.all([
      gq,
      supabase.from("tasks").select("*").eq("user_id", userId).order("done").order("due_date", { nullsFirst: false }).order("created_at"),
    ]);
    setGoals((g as Goal[]) ?? []);
    setTasks((t as Task[]) ?? []);
  }, [userId, editable]);

  useEffect(() => { load(); }, [load]);

  if (!goals) return <div className="skeleton list-skeleton" />;

  const inbox = tasks.filter((t) => !t.goal_id);
  const open = tasks.filter((t) => !t.done);
  const todayCount = open.filter((t) => t.due_date && t.due_date <= today()).length;

  return (
    <div className="goals">
      {editable && (
        <div className="goals-summary">
          <div><b>{open.length}</b><span>задач в работе</span></div>
          <div className={todayCount ? "hot" : ""}><b>{todayCount}</b><span>на сегодня и просрочено</span></div>
          <div><b>{goals.filter((g) => g.done).length}/{goals.length}</b><span>целей выполнено</span></div>
        </div>
      )}

      {editable && <NewGoal onAdded={load} />}

      {goals.map((g, i) => (
        <GoalCard key={g.id} goal={g} tasks={tasks.filter((t) => t.goal_id === g.id)} editable={editable} onChange={load} i={i} />
      ))}

      {editable && (
        <section className="goal-card inbox" style={{ "--i": goals.length } as React.CSSProperties}>
          <header className="goal-head">
            <div><h3>Задачи без цели</h3><span className="label">Быстрые дела</span></div>
          </header>
          <TaskList tasks={inbox} editable onChange={load} />
          <NewTask goalId={null} onAdded={load} />
        </section>
      )}

      {!editable && !goals.length && <p className="lead">Открытых целей пока нет.</p>}
    </div>
  );
}

function GoalCard({ goal, tasks, editable, onChange, i }: { goal: Goal; tasks: Task[]; editable: boolean; onChange: () => void; i: number }) {
  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : goal.done ? 100 : 0;
  const [confirm, setConfirm] = useState(false);

  const update = async (patch: Partial<Goal>) => { await supabase.from("goals").update(patch).eq("id", goal.id); onChange(); };

  return (
    <section className={`goal-card ${goal.done ? "done" : ""}`} style={{ "--i": i } as React.CSSProperties}>
      <header className="goal-head">
        <div>
          <h3>{goal.title}</h3>
          <span className="label">
            {goal.due_date ? `До ${shortDate(goal.due_date)}` : "Без срока"} · {done}/{tasks.length} задач
            {editable && (goal.is_public ? " · видна в профиле" : " · только ты")}
          </span>
        </div>
        {editable && (
          <div className="goal-tools">
            <button type="button" className="chip-btn" onClick={() => update({ is_public: !goal.is_public })}>{goal.is_public ? "Скрыть из профиля" : "Показать в профиле"}</button>
            <button type="button" className="chip-btn" onClick={() => update({ done: !goal.done })}>{goal.done ? "Вернуть в работу" : "Цель выполнена"}</button>
            {confirm
              ? <button type="button" className="chip-btn danger" onClick={async () => { await supabase.from("goals").delete().eq("id", goal.id); onChange(); }}>Точно удалить</button>
              : <button type="button" className="chip-btn" onClick={() => setConfirm(true)}>Удалить</button>}
          </div>
        )}
      </header>
      <div className="bar light"><b style={{ width: `${pct}%` }} /></div>
      <TaskList tasks={tasks} editable={editable} onChange={onChange} />
      {editable && !goal.done && <NewTask goalId={goal.id} onAdded={onChange} />}
    </section>
  );
}

function TaskList({ tasks, editable, onChange }: { tasks: Task[]; editable: boolean; onChange: () => void }) {
  const [local, setLocal] = useState<Record<string, boolean>>({});
  if (!tasks.length) return null;

  const toggle = async (t: Task) => {
    setLocal((s) => ({ ...s, [t.id]: !(s[t.id] ?? t.done) }));
    await supabase.from("tasks").update({ done: !(local[t.id] ?? t.done) }).eq("id", t.id);
    onChange();
  };

  return (
    <ul className="tasks">
      {tasks.map((t) => {
        const done = local[t.id] ?? t.done;
        return (
          <li key={t.id} className={done ? "done" : ""}>
            <button type="button" className="chk" aria-pressed={done} disabled={!editable} onClick={() => toggle(t)} aria-label={done ? "Вернуть" : "Готово"} />
            <span className="task-title">{t.title}</span>
            {t.due_date && <span className={`due ${dueClass(t.due_date, done)}`}>{shortDate(t.due_date)}</span>}
            {editable && (
              <button type="button" className="icon-btn sm" aria-label="Удалить задачу"
                onClick={async () => { await supabase.from("tasks").delete().eq("id", t.id); onChange(); }}>×</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewTask({ goalId, onAdded }: { goalId: string | null; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase.from("tasks").insert({ title: title.trim(), goal_id: goalId, due_date: due || null });
    setTitle(""); setDue("");
    onAdded();
  };
  return (
    <form className="new-task" onSubmit={add}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая задача" maxLength={160} aria-label="Новая задача" />
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок" />
      <button className="btn sm" type="submit" disabled={!title.trim()}>Добавить</button>
    </form>
  );
}

function NewGoal({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pub, setPub] = useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return;
    await supabase.from("goals").insert({ title: title.trim(), due_date: due || null, is_public: pub });
    setTitle(""); setDue(""); setPub(false);
    onAdded();
  };
  return (
    <form className="new-goal card" onSubmit={add}>
      <div className="input grow"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая цель: выйти на 150 000 ₽ в месяц" maxLength={100} aria-label="Новая цель" /></div>
      <div className="input"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок цели" /></div>
      <label className="mini-toggle"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} /> В профиле</label>
      <button className="btn" type="submit" disabled={title.trim().length < 2}>Поставить цель</button>
    </form>
  );
}
