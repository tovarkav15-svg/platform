"use client";

import { useMemo, useState } from "react";
import { supabase, publicMedia, STAGES, type Project, type Stage } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/upload";
import { NICHES } from "@/lib/niches";
import { Modal } from "../Modal";
import { ImagePicker } from "../ImagePicker";

type Props = { open: boolean; onClose: () => void; userId: string; project?: Project | null; onSaved: (id?: string) => void };

export function ProjectEditor({ open, onClose, userId, project, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={project ? <>Изменить <span className="it">проект</span></> : <>Что ты <span className="it">строишь</span></>}>
      {open && <Form key={project?.id ?? "new"} userId={userId} project={project} onDone={(id) => { onSaved(id); onClose(); }} />}
    </Modal>
  );
}

function Form({ userId, project, onDone }: { userId: string; project?: Project | null; onDone: (id?: string) => void }) {
  const [f, setF] = useState({
    name: project?.name ?? "", tagline: project?.tagline ?? "", description: project?.description ?? "",
    stage: (project?.stage ?? "idea") as Stage, niche: project?.niche ?? "", link: project?.link ?? "", looking_for: project?.looking_for ?? "",
    goal_label: project?.goal_label ?? "", goal_target: project?.goal_target ? String(project.goal_target) : "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [imagePath, setImagePath] = useState(project?.image_path ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : publicMedia(imagePath)), [file, imagePath]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.name.trim().length < 2) return setError("Назови проект");
    if (f.link && !/^https?:\/\//.test(f.link)) return setError("Ссылка должна начинаться с https://");
    setBusy(true); setError("");
    try {
      const image_path = file ? await uploadPublicImage(userId, file) : imagePath;
      const { goal_target, ...rest } = f;
      const row = { ...rest, goal_target: Math.max(0, parseInt(goal_target.replace(/\D/g, ""), 10) || 0), name: f.name.trim(), image_path, updated_at: new Date().toISOString() };
      const res = project
        ? await supabase.from("projects").update(row).eq("id", project.id).select("id").single()
        : await supabase.from("projects").insert(row).select("id").single();
      if (res.error) throw res.error;
      onDone(res.data.id);
    } catch {
      setError("Не получилось сохранить. Попробуй ещё раз.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!project) return;
    setBusy(true);
    await supabase.from("projects").delete().eq("id", project.id);
    onDone();
  }

  return (
    <form onSubmit={save} className="editor">
      <ImagePicker preview={preview} onPick={setFile} onClear={() => { setFile(null); setImagePath(null); }} />
      <label className="field">
        <span>Название</span>
        <div className="input"><input id="pName" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Бренд одежды «Тень»" /></div>
      </label>
      <label className="field">
        <span>Одной строкой</span>
        <div className="input"><input id="pTagline" value={f.tagline} maxLength={120} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Оверсайз-худи из плотного хлопка, первый дроп в ноябре" /></div>
      </label>
      <fieldset className="field plain">
        <span>Стадия</span>
        <div className="seg">
          {(Object.keys(STAGES) as Stage[]).map((s) => (
            <label key={s} className="seg-item" aria-current={f.stage === s ? "page" : undefined}>
              <input type="radio" name="stage" value={s} checked={f.stage === s} onChange={() => setF({ ...f, stage: s })} hidden />
              {STAGES[s]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row2">
        <label className="field">
          <span>Цель проекта</span>
          <div className="input"><input id="pGoal" value={f.goal_label} maxLength={60} onChange={(e) => setF({ ...f, goal_label: e.target.value })} placeholder="10 видео" /></div>
        </label>
        <label className="field">
          <span>Сколько всего <span className="count">для прогресса</span></span>
          <div className="input"><input id="pTarget" inputMode="numeric" value={f.goal_target} onChange={(e) => setF({ ...f, goal_target: e.target.value.replace(/\D/g, "") })} placeholder="10" /></div>
        </label>
      </div>
      <label className="field">
        <span>Подробнее <span className="count">{f.description.length}/1000</span></span>
        <div className="input"><textarea id="pDesc" rows={4} value={f.description} maxLength={1000} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Что за проект, для кого, что уже сделано" /></div>
      </label>
      <label className="field">
        <span>Кого ищешь</span>
        <div className="input"><input id="pLooking" value={f.looking_for} maxLength={200} onChange={(e) => setF({ ...f, looking_for: e.target.value })} placeholder="Монтажёр на рилсы, дизайнер карточек" /></div>
      </label>
      <div className="row2">
        <label className="field">
          <span>Ниша</span>
          <div className="input">
            <select id="pNiche" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}>
              <option value="">Без ниши</option>
              {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
        </label>
        <label className="field">
          <span>Ссылка</span>
          <div className="input"><input id="pLink" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value.trim() })} placeholder="https://" /></div>
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="editor-actions">
        {project && (confirmDelete
          ? <button type="button" className="btn danger" disabled={busy} onClick={remove}>Точно удалить</button>
          : <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>Удалить</button>)}
        <button type="submit" className="btn" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </form>
  );
}
