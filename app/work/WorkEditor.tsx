"use client";

import { useMemo, useState } from "react";
import { supabase, publicMedia, type Work } from "@/lib/supabase";
import { uploadPublicImage } from "@/lib/upload";
import { NICHES } from "@/lib/niches";
import { Modal } from "../Modal";
import { ImagePicker } from "../ImagePicker";

type Props = { open: boolean; onClose: () => void; userId: string; work?: Work | null; onSaved: () => void };

export function WorkEditor({ open, onClose, userId, work, onSaved }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={work ? <>Изменить <span className="it">работу</span></> : <>Новая <span className="it">работа</span></>}>
      {open && <Form key={work?.id ?? "new"} userId={userId} work={work} onDone={() => { onSaved(); onClose(); }} />}
    </Modal>
  );
}

function Form({ userId, work, onDone }: { userId: string; work?: Work | null; onDone: () => void }) {
  const [f, setF] = useState({
    title: work?.title ?? "", description: work?.description ?? "", result: work?.result ?? "",
    niche: work?.niche ?? "", link: work?.link ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [imagePath, setImagePath] = useState(work?.image_path ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : publicMedia(imagePath)), [file, imagePath]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 2) return setError("Назови работу");
    if (f.link && !/^https?:\/\//.test(f.link)) return setError("Ссылка должна начинаться с https://");
    setBusy(true); setError("");
    try {
      const image_path = file ? await uploadPublicImage(userId, file) : imagePath;
      const row = { ...f, title: f.title.trim(), image_path };
      const { error } = work
        ? await supabase.from("works").update(row).eq("id", work.id)
        : await supabase.from("works").insert(row);
      if (error) throw error;
      onDone();
    } catch {
      setError("Не получилось сохранить. Попробуй ещё раз.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!work) return;
    setBusy(true);
    await supabase.from("works").delete().eq("id", work.id);
    onDone();
  }

  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <form onSubmit={save} className="editor">
      <ImagePicker preview={preview} onPick={setFile} onClear={() => { setFile(null); setImagePath(null); }} />
      <label className="field">
        <span>Название</span>
        <div className="input"><input id="wTitle" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Монтаж рекламы для бренда одежды" /></div>
      </label>
      <label className="field">
        <span>Результат <span className="count">в цифрах, если есть</span></span>
        <div className="input"><input id="wResult" value={f.result} maxLength={120} onChange={(e) => setF({ ...f, result: e.target.value })} placeholder="2,4 млн просмотров · +38% продаж" /></div>
      </label>
      <label className="field">
        <span>Что сделал <span className="count">{f.description.length}/600</span></span>
        <div className="input"><textarea id="wDesc" rows={4} value={f.description} maxLength={600} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Задача, что ты делал, какие инструменты" /></div>
      </label>
      <div className="row2">
        <label className="field">
          <span>Ниша</span>
          <div className="input">
            <select id="wNiche" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}>
              <option value="">Без ниши</option>
              {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
        </label>
        <label className="field">
          <span>Ссылка</span>
          <div className="input"><input id="wLink" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value.trim() })} placeholder="https://" /></div>
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="editor-actions">
        {work && (confirmDelete
          ? <button type="button" className="btn danger" disabled={busy} onClick={remove}>Точно удалить</button>
          : <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>Удалить</button>)}
        <button type="submit" className="btn" disabled={busy}>{busy ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </form>
  );
}
