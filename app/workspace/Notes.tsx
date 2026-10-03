"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mediaPaths, plainText } from "@/lib/noteHtml";
import { NoteEditor } from "./NoteEditor";

type Note = { id: string; folder: string; title: string; body: string; pinned: boolean; created_at: string; updated_at: string };
const ALL = "__all";
const BASE_FOLDERS = ["Заметки", "Проекты", "Идеи", "Личное"];
const FOLDER_ICON: Record<string, string> = { Заметки: "▤", Проекты: "◆", Идеи: "✦", Личное: "♥" };

const store = {
  get: (): string[] => { try { return JSON.parse(localStorage.getItem("notes:folders") ?? "[]"); } catch { return []; } },
  set: (v: string[]) => { try { localStorage.setItem("notes:folders", JSON.stringify(v)); } catch {} },
};

/** Заголовок — первая строка, превью — следующая непустая (как в Заметках на iPhone) */
const split = (body: string) => {
  const lines = plainText(body).split("\n").map((l) => l.trim()).filter(Boolean);
  return { title: (lines[0] ?? "").replace(/^[☐☑•]\s*/, "").slice(0, 200), preview: (lines[1] ?? "").replace(/^[☐☑•]\s*/, "") };
};
const when = (iso: string) => {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff === 0) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Вчера";
  if (diff < 7) return d.toLocaleDateString("ru-RU", { weekday: "long" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric", year: "2-digit" });
};
const group = (n: Note) => {
  if (n.pinned) return "Закреплённые";
  const diff = (Date.now() - new Date(n.updated_at).getTime()) / 86400000;
  if (new Date(n.updated_at).toDateString() === new Date().toDateString()) return "Сегодня";
  if (diff < 7) return "Предыдущие 7 дней";
  if (diff < 30) return "Предыдущие 30 дней";
  return "Ранее";
};
const GROUPS = ["Закреплённые", "Сегодня", "Предыдущие 7 дней", "Предыдущие 30 дней", "Ранее"];

export function Notes({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [folder, setFolder] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"folders" | "list" | "editor">("list"); // для телефона
  const [custom, setCustom] = useState<string[]>([]);
  const [saved, setSaved] = useState<"" | "saving" | "saved">("");
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const load = useCallback(async () => {
    const { data } = await supabase.from("notes").select("*").eq("user_id", userId).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
    setNotes((data as Note[]) ?? []);
  }, [userId]);
  useEffect(() => { load(); setCustom(store.get()); }, [load]);

  const folders = useMemo(() => Array.from(new Set([...BASE_FOLDERS, ...custom, ...(notes ?? []).map((n) => n.folder)])), [custom, notes]);
  const count = (f: string) => (notes ?? []).filter((n) => f === ALL || n.folder === f).length;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (notes ?? []).filter((n) => (folder === ALL || n.folder === folder) && (!s || plainText(n.body).toLowerCase().includes(s)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  }, [notes, folder, q]);
  const open = notes?.find((n) => n.id === openId) ?? null;

  // Сохраняем через полсекунды после последней правки
  const patch = (id: string, change: Partial<Note>) => {
    const updated_at = new Date().toISOString();
    setNotes((all) => (all ?? []).map((n) => (n.id === id ? { ...n, ...change, updated_at } : n)));
    setSaved("saving");
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(async () => {
      const cur = { ...change };
      if (cur.body !== undefined) cur.title = split(cur.body).title;
      await supabase.from("notes").update({ ...cur, updated_at }).eq("id", id);
      setSaved("saved");
    }, 500));
  };

  async function create() {
    const f = folder === ALL ? "Заметки" : folder;
    const { data } = await supabase.from("notes").insert({ folder: f, body: "" }).select("*").single();
    if (!data) return;
    setNotes((all) => [data as Note, ...(all ?? [])]);
    setOpenId((data as Note).id);
    setStage("editor");
  }

  async function remove(n: Note) {
    if (n.body.trim() && !window.confirm("Удалить заметку?")) return;
    await supabase.from("notes").delete().eq("id", n.id);
    const files = mediaPaths(n.body);
    if (files.length) supabase.storage.from("notes-media").remove(files).then(() => {});
    setNotes((all) => (all ?? []).filter((x) => x.id !== n.id));
    setOpenId(null);
    setStage("list");
  }

  // Пустую заметку, из которой ушли, убираем — как на iPhone
  function leave(next: string | null) {
    const cur = open;
    if (cur && cur.id !== next && !plainText(cur.body).trim() && !mediaPaths(cur.body).length) { supabase.from("notes").delete().eq("id", cur.id).then(() => {}); setNotes((all) => (all ?? []).filter((x) => x.id !== cur.id)); }
    setOpenId(next);
  }

  function addFolder() {
    const name = window.prompt("Название новой папки")?.trim().slice(0, 40);
    if (!name || folders.includes(name)) return;
    const next = [...custom, name];
    setCustom(next); store.set(next); setFolder(name); setStage("list");
  }

  const words = open ? plainText(open.body).trim().split(/\s+/).filter(Boolean).length : 0;
  const todo = open ? { all: (open.body.match(/data-done="(true|false)"/g) ?? []).length + (open.body.match(/[☐☑]/g) ?? []).length, done: (open.body.match(/data-done="true"/g) ?? []).length + (open.body.match(/☑/g) ?? []).length } : { all: 0, done: 0 };
  const grouped = GROUPS.map((g) => ({ g, items: list.filter((n) => group(n) === g) })).filter((x) => x.items.length);

  return (
    <div className={`nt stage-${stage}`}>
      {/* Папки */}
      <aside className="nt-folders">
        <div className="nt-bar"><b className="nt-h">Папки</b><button type="button" className="nt-link" onClick={addFolder}>Новая папка</button></div>
        <div className="nt-group">
          {[ALL, ...folders].map((f) => (
            <button key={f} type="button" className="nt-folder" aria-current={folder === f ? "true" : undefined} onClick={() => { setFolder(f); leave(null); setStage("list"); }}>
              <i aria-hidden="true">{f === ALL ? "▦" : FOLDER_ICON[f] ?? "▢"}</i>
              <span>{f === ALL ? "Все заметки" : f}</span>
              <em>{notes ? count(f) : ""}</em>
              <s aria-hidden="true">›</s>
            </button>
          ))}
        </div>
      </aside>

      {/* Список */}
      <section className="nt-list">
        <div className="nt-bar">
          <button type="button" className="nt-back" onClick={() => setStage("folders")}>‹ Папки</button>
          <b className="nt-h">{folder === ALL ? "Все заметки" : folder}</b>
        </div>
        <label className="nt-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" />
        </label>
        <div className="nt-scroll">
          {notes === null ? <div className="skeleton list-skeleton" /> : list.length === 0 ? (
            <div className="nt-empty"><span>✎</span><b>{q ? "Ничего не нашлось" : "Нет заметок"}</b><small>{q ? "Попробуй другое слово" : "Запиши идею, план проекта или список дел"}</small></div>
          ) : grouped.map(({ g, items }) => (
            <div key={g} className="nt-sec">
              <span className="nt-sec-h">{g === "Закреплённые" ? "📌 " : ""}{g}</span>
              <div className="nt-group">
                {items.map((n) => {
                  const s = split(n.body);
                  return (
                    <button key={n.id} type="button" className="nt-row" aria-current={openId === n.id ? "true" : undefined} onClick={() => { leave(n.id); setStage("editor"); }}>
                      <b>{s.title || "Новая заметка"}</b>
                      <span><em>{when(n.updated_at)}</em>{s.preview || "Нет дополнительного текста"}</span>
                      {folder === ALL && <small>▢ {n.folder}</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="nt-foot"><span>{list.length} {list.length % 10 === 1 && list.length % 100 !== 11 ? "заметка" : [2, 3, 4].includes(list.length % 10) && ![12, 13, 14].includes(list.length % 100) ? "заметки" : "заметок"}</span>
          <button type="button" className="nt-new" onClick={create} aria-label="Новая заметка" title="Новая заметка">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M14 6l4 4" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
      </section>

      {/* Редактор */}
      <section className="nt-editor">
        {open ? (
          <>
            <div className="nt-bar nt-tools">
              <button type="button" className="nt-back" onClick={() => { leave(null); setStage("list"); }}>‹ {folder === ALL ? "Заметки" : folder}</button>
              <span className="nt-status">{saved === "saving" ? "Сохраняю…" : saved === "saved" ? "Сохранено" : ""}</span>
              <button type="button" className={`nt-tool ${open.pinned ? "on" : ""}`} onClick={() => patch(open.id, { pinned: !open.pinned })} title={open.pinned ? "Открепить" : "Закрепить"}>📌</button>
              <select className="nt-move" value={open.folder} onChange={(e) => patch(open.id, { folder: e.target.value })} aria-label="Папка">
                {folders.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <button type="button" className="nt-tool" onClick={() => { navigator.clipboard?.writeText(plainText(open.body)); setSaved("saved"); }} title="Скопировать текст">⧉</button>
              <button type="button" className="nt-tool danger" onClick={() => remove(open)} title="Удалить">🗑</button>
            </div>
            <div className="nt-paper">
              <span className="nt-date">{new Date(open.updated_at).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <NoteEditor noteId={open.id} body={open.body} userId={userId} onChange={(html) => patch(open.id, { body: html })} />
            </div>
            <div className="nt-meta">
              <span>{words} {words % 10 === 1 && words % 100 !== 11 ? "слово" : [2, 3, 4].includes(words % 10) && ![12, 13, 14].includes(words % 100) ? "слова" : "слов"}</span>
              {todo.all > 0 && <span className="nt-todo"><i style={{ width: `${(todo.done / todo.all) * 100}%` }} />{todo.done}/{todo.all} выполнено</span>}
            </div>
          </>
        ) : (
          <div className="nt-blank">
            <span>✎</span>
            <b>Выбери заметку</b>
            <small>или начни новую — идею, план проекта, список дел</small>
            <button type="button" className="nt-pill" onClick={create}>Новая заметка</button>
          </div>
        )}
      </section>
    </div>
  );
}
