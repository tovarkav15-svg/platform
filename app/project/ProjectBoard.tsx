"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type Milestone, type Project, type ProfileCard, type ProjectTask } from "@/lib/supabase";
import { Avatar } from "../Avatar";

const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/** Цель + прогресс, этапы и задачи проекта. canEdit — автор или участник команды */
export function ProjectBoard({ project, canEdit, team, onProgress }: {
  project: Project; canEdit: boolean; team: ProfileCard[]; onProgress: (v: number) => void;
}) {
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);

  const load = useCallback(async () => {
    const [m, t] = await Promise.all([
      supabase.from("project_milestones").select("*").eq("project_id", project.id).order("position").order("created_at"),
      supabase.from("project_tasks").select("*").eq("project_id", project.id).order("done").order("created_at"),
    ]);
    setMilestones((m.data as Milestone[]) ?? []);
    setTasks((t.data as ProjectTask[]) ?? []);
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <GoalCard project={project} canEdit={canEdit} onProgress={onProgress} />
      <section className="card">
        <div className="section-head">
          <div className="label">Этапы</div>
          {milestones && milestones.length > 0 && (
            <span className="label">{milestones.filter((m) => m.status === "done").length}/{milestones.length}</span>
          )}
        </div>
        {milestones === null ? <div className="skeleton list-skeleton" /> : (
          <Milestones projectId={project.id} items={milestones} canEdit={canEdit} onChange={load} />
        )}
      </section>
      <section className="card">
        <div className="section-head">
          <div className="label">Задачи</div>
          {tasks.length > 0 && <span className="label">{tasks.filter((t) => t.done).length}/{tasks.length} готово</span>}
        </div>
        <ProjectTasks projectId={project.id} items={tasks} canEdit={canEdit} team={team} onChange={load} />
      </section>
    </>
  );
}

function GoalCard({ project, canEdit, onProgress }: { project: Project; canEdit: boolean; onProgress: (v: number) => void }) {
  const [current, setCurrent] = useState(project.goal_current);
  useEffect(() => setCurrent(project.goal_current), [project.goal_current]);
  if (!project.goal_label && !project.goal_target) return null;
  const target = project.goal_target;
  const pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;

  const set = async (v: number) => {
    const next = Math.max(0, v);
    setCurrent(next);
    await supabase.rpc("set_project_progress", { p: project.id, v: next });
    onProgress(next);
  };

  return (
    <section className="card goal-hero">
      <div className="goal-hero-row">
        <div>
          <div className="label">Цель</div>
          <b className="goal-hero-title">{project.goal_label || `${target}`}</b>
        </div>
        {target > 0 && (
          <div className="goal-hero-count">
            <div className="label">Прогресс</div>
            <span className="goal-hero-num"><b>{current}</b> / {target}</span>
          </div>
        )}
      </div>
      {target > 0 && (
        <>
          <div className="progress-steps" aria-label={`${current} из ${target}`}>
            {target <= 30
              ? Array.from({ length: target }, (_, i) => <i key={i} className={i < current ? "on" : ""} style={{ "--d": `${i * 25}ms` } as React.CSSProperties} />)
              : <div className="bar light"><b style={{ width: `${pct}%` }} /></div>}
          </div>
          <div className="goal-hero-foot">
            <span className="label">{pct}% готово{current >= target ? " · цель достигнута" : ""}</span>
            {canEdit && (
              <span className="stepper">
                <button type="button" className="icon-btn sm" onClick={() => set(current - 1)} disabled={current <= 0} aria-label="Минус один">−</button>
                <button type="button" className="icon-btn sm" onClick={() => set(current + 1)} aria-label="Плюс один">+</button>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const NEXT_STATUS: Record<Milestone["status"], Milestone["status"]> = { todo: "current", current: "done", done: "todo" };

function Milestones({ projectId, items, canEdit, onChange }: { projectId: string; items: Milestone[]; canEdit: boolean; onChange: () => void }) {
  const [title, setTitle] = useState("");

  const cycle = async (m: Milestone) => {
    const status = NEXT_STATUS[m.status];
    // Текущий этап может быть только один
    if (status === "current") await supabase.from("project_milestones").update({ status: "todo" }).eq("project_id", projectId).eq("status", "current");
    await supabase.from("project_milestones").update({ status }).eq("id", m.id);
    onChange();
  };

  const move = async (i: number, d: number) => {
    const a = items[i], b = items[i + d];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("project_milestones").update({ position: b.position === a.position ? i + d : b.position }).eq("id", a.id),
      supabase.from("project_milestones").update({ position: b.position === a.position ? i : a.position }).eq("id", b.id),
    ]);
    onChange();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const position = (items[items.length - 1]?.position ?? 0) + 1;
    await supabase.from("project_milestones").insert({ project_id: projectId, title: title.trim(), position, status: items.length ? "todo" : "current" });
    setTitle("");
    onChange();
  };

  return (
    <>
      {items.length ? (
        <ol className="milestones">
          {items.map((m, i) => (
            <li key={m.id} className={`ms ms-${m.status}`} style={{ "--i": i } as React.CSSProperties}>
              <button type="button" className="ms-mark" disabled={!canEdit} onClick={() => cycle(m)}
                aria-label={m.status === "done" ? "Готово" : m.status === "current" ? "Сейчас" : "Впереди"}
                title={canEdit ? "Нажми, чтобы сменить статус" : undefined}>
                {m.status === "done" ? "✓" : m.status === "current" ? "→" : ""}
              </button>
              <span className="ms-title">{m.title}</span>
              {m.status === "current" && <span className="ms-now">сейчас</span>}
              {canEdit && (
                <span className="ms-tools">
                  <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше">↑</button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Ниже">↓</button>
                  <button type="button" className="icon-btn sm" aria-label="Удалить этап"
                    onClick={async () => { await supabase.from("project_milestones").delete().eq("id", m.id); onChange(); }}>×</button>
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="lead small">{canEdit ? "Разбей проект на этапы: концепт, брендинг, первый релиз…" : "Этапов пока нет."}</p>}
      {canEdit && (
        <form className="new-task" onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Новый этап" aria-label="Новый этап" />
          <button className="btn sm" type="submit" disabled={!title.trim()}>Добавить</button>
        </form>
      )}
    </>
  );
}

function ProjectTasks({ projectId, items, canEdit, team, onChange }: { projectId: string; items: ProjectTask[]; canEdit: boolean; team: ProfileCard[]; onChange: () => void }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const byId = new Map(team.map((t) => [t.id, t]));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await supabase.from("project_tasks").insert({ project_id: projectId, title: title.trim(), assignee: assignee || null });
    setTitle("");
    onChange();
  };

  return (
    <>
      {items.length ? (
        <ul className="tasks">
          {items.map((t) => {
            const who = t.assignee ? byId.get(t.assignee) : null;
            return (
              <li key={t.id} className={t.done ? "done" : ""}>
                <button type="button" className="chk" aria-pressed={t.done} disabled={!canEdit}
                  onClick={async () => { await supabase.from("project_tasks").update({ done: !t.done }).eq("id", t.id); onChange(); }}
                  aria-label={t.done ? "Вернуть" : "Готово"} />
                <span className="task-title">{t.title}</span>
                {t.due_date && <span className="due">{shortDate(t.due_date)}</span>}
                {who && <span title={who.display_name}><Avatar name={who.display_name} avatar={who.avatar} accent={who.accent} size={24} /></span>}
                {canEdit && (
                  <button type="button" className="icon-btn sm" aria-label="Удалить задачу"
                    onClick={async () => { await supabase.from("project_tasks").delete().eq("id", t.id); onChange(); }}>×</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="lead small">{canEdit ? "Добавь задачи и назначь их на людей из команды." : "Задач пока нет."}</p>}
      {canEdit && (
        <form className="new-task" onSubmit={add}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Новая задача" aria-label="Новая задача" />
          {team.length > 0 && (
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Исполнитель" className="mini-select">
              <option value="">Без исполнителя</option>
              {team.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
          )}
          <button className="btn sm" type="submit" disabled={!title.trim()}>Добавить</button>
        </form>
      )}
    </>
  );
}
