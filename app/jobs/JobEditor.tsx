"use client";

import { useMemo, useState } from "react";
import { supabase, publicMedia } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/upload";
import { NICHES } from "@/lib/niches";
import { Modal } from "../Modal";
import { ImagePicker } from "../ImagePicker";
import type { Job, JobCase } from "./JobCard";

export function JobEditor({ open, onClose, userId, job, onSaved }: { open: boolean; onClose: () => void; userId: string; job: Job | null; onSaved: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={job ? <>Изменить <span className="it">карточку</span></> : <>Разместить <span className="it">вакансию</span></>}>
      {open && <Form key={job?.id ?? "new"} userId={userId} job={job} onDone={() => { onSaved(); onClose(); }} />}
    </Modal>
  );
}

function Form({ userId, job, onDone }: { userId: string; job: Job | null; onDone: () => void }) {
  const [f, setF] = useState({
    service: job?.service ?? "", niche: job?.niche ?? "", description: job?.description ?? "",
    avg_check: job?.avg_check ? String(job.avg_check) : "", active: job?.active ?? true,
  });
  const [cases, setCases] = useState<JobCase[]>(job?.cases?.length ? job.cases : [{ title: "", link: "" }]);
  const [file, setFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState(job?.photo_path ?? null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : publicMedia(photoPath)), [file, photoPath]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.service.trim().length < 2) return setError("Напиши, какую услугу делаешь");
    const clean = cases.map((c) => ({ title: c.title.trim().slice(0, 60), link: c.link.trim() })).filter((c) => c.title || c.link).slice(0, 6);
    if (clean.some((c) => c.link && !/^https?:\/\//.test(c.link))) return setError("Ссылки на кейсы должны начинаться с https://");
    setBusy(true); setError("");
    try {
      const photo_path = file ? await uploadPublicImage(userId, file) : photoPath;
      const row = {
        service: f.service.trim(), niche: f.niche, description: f.description.trim(),
        avg_check: Math.min(100000000, parseInt(f.avg_check.replace(/\D/g, ""), 10) || 0),
        active: f.active, photo_path, cases: clean, updated_at: new Date().toISOString(),
      };
      const { error } = job ? await supabase.from("jobs").update(row).eq("id", job.id) : await supabase.from("jobs").insert(row);
      if (error) throw error;
      onDone();
    } catch {
      setError("Не получилось сохранить. Попробуй ещё раз.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="editor">
      <ImagePicker preview={preview} onPick={setFile} onClear={() => { setFile(null); setPhotoPath(null); }} />
      <p className="hint">Фото для карточки: ты за работой, кадр из кейса или результат. Без фото возьмём аватар.</p>
      <label className="field">
        <span>Выполняемая услуга</span>
        <div className="input"><input value={f.service} maxLength={80} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="Монтаж рилсов для экспертов" /></div>
      </label>
      <div className="row2">
        <label className="field">
          <span>Ниша</span>
          <div className="input">
            <select value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}>
              <option value="">Выбери нишу</option>
              {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
        </label>
        <label className="field">
          <span>Средний чек, ₽</span>
          <div className="input"><input inputMode="numeric" value={f.avg_check} onChange={(e) => setF({ ...f, avg_check: e.target.value.replace(/\D/g, "") })} placeholder="15000" /></div>
        </label>
      </div>
      <label className="field">
        <span>Коротко о работе <span className="count">{f.description.length}/600</span></span>
        <div className="input"><textarea rows={3} maxLength={600} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Что входит, сроки, с кем работал" /></div>
      </label>
      <fieldset className="field plain">
        <span>Портфолио / кейсы <span className="count">до 6</span></span>
        <div className="cases-edit">
          {cases.map((c, k) => (
            <div key={k} className="case-row">
              <div className="input"><input value={c.title} maxLength={60} placeholder="Название кейса" aria-label="Название кейса"
                onChange={(e) => setCases(cases.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)))} /></div>
              <div className="input"><input value={c.link} placeholder="https://" aria-label="Ссылка на кейс"
                onChange={(e) => setCases(cases.map((x, j) => (j === k ? { ...x, link: e.target.value } : x)))} /></div>
              <button type="button" className="icon-btn sm" onClick={() => setCases(cases.filter((_, j) => j !== k))} aria-label="Убрать кейс">×</button>
            </div>
          ))}
          {cases.length < 6 && <button type="button" className="link-btn" onClick={() => setCases([...cases, { title: "", link: "" }])}>+ Ещё кейс</button>}
        </div>
      </fieldset>
      <label className="mini-toggle"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Показывать на бирже</label>
      {error && <div className="form-error">{error}</div>}
      <div className="editor-actions">
        {job && (confirm
          ? <button type="button" className="btn danger" disabled={busy} onClick={async () => { setBusy(true); await supabase.from("jobs").delete().eq("id", job.id); onDone(); }}>Точно удалить</button>
          : <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>Удалить</button>)}
        <button type="submit" className="btn" disabled={busy}>{busy ? "Сохраняю…" : job ? "Сохранить" : "Разместить"}</button>
      </div>
    </form>
  );
}
