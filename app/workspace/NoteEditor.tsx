"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/upload";
import { forSave, fromPlain, hydrateMedia, isHtml, sanitize } from "@/lib/noteHtml";

const MAX = 50 * 1024 * 1024;
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`);
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Редактор заметки как на iPhone: форматирование, чек-листы, фото, видео и файлы прямо в тексте */
export function NoteEditor({ noteId, body, userId, onChange }: { noteId: string; body: string; userId: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const imgInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [aa, setAa] = useState(false);
  const [busy, setBusy] = useState("");
  const [state, setState] = useState<Record<string, boolean>>({});

  // Содержимое ставим один раз при открытии заметки, дальше редактор живёт сам
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = sanitize(isHtml(body) ? body : fromPlain(body)) || "<h1><br></h1>";
    prepare(el);
    hydrateMedia(el);
    if (!body.trim()) placeCaret(el.firstElementChild ?? el);
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Помним, где стоял курсор: кнопки тулбара и выбор файла его сбивают
  useEffect(() => {
    const on = () => {
      const s = window.getSelection();
      if (s && s.rangeCount && ref.current?.contains(s.anchorNode)) {
        range.current = s.getRangeAt(0).cloneRange();
        setState({
          bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"), strike: document.queryCommandState("strikeThrough"),
        });
      }
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  const emit = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (ref.current) onChange(forSave(ref.current)); }, 400);
  };
  const restore = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const s = window.getSelection();
    if (range.current && s) { s.removeAllRanges(); s.addRange(range.current); }
  };
  const cmd = (name: string, value?: string) => { restore(); document.execCommand(name, false, value); emit(); };
  const block = (tag: string) => { setAa(false); cmd("formatBlock", tag); };

  function checklist() {
    restore();
    const s = window.getSelection();
    const inCheck = s?.anchorNode && (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode.parentElement)?.closest("ul.nt-check");
    if (inCheck) { inCheck.classList.remove("nt-check"); emit(); return; }
    document.execCommand("insertUnorderedList");
    const node = window.getSelection()?.anchorNode;
    const ul = (node instanceof Element ? node : node?.parentElement)?.closest("ul");
    if (ul) { ul.classList.add("nt-check"); ul.querySelectorAll("li").forEach((li) => { if (!li.hasAttribute("data-done")) li.setAttribute("data-done", "false"); }); }
    emit();
  }

  function link() {
    const url = window.prompt("Ссылка (https://…)");
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const sel = range.current;
    if (sel && !sel.collapsed) cmd("createLink", href);
    else cmd("insertHTML", `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow">${escAttr(url)}</a>&nbsp;`);
  }

  function insertDate() {
    cmd("insertText", new Date().toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }));
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 10);
    for (const f of list) {
      if (f.size > MAX) { window.alert(`«${f.name}» больше 50 МБ`); continue; }
      setBusy(`Загружаю ${f.name}…`);
      const isImg = f.type.startsWith("image/");
      const isVid = f.type.startsWith("video/");
      const blob: Blob = isImg ? await compressImage(f, 2000, 0.86).catch(() => f) : f;
      const ext = isImg && blob !== f ? "jpg" : (f.name.split(".").pop() || "bin").toLowerCase().slice(0, 6);
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("notes-media").upload(path, blob, { contentType: blob.type || f.type || "application/octet-stream" });
      if (error) { window.alert(`Не получилось загрузить «${f.name}»`); continue; }
      const local = URL.createObjectURL(blob);
      const html = isImg
        ? `<figure class="nt-media"><img data-path="${path}" src="${local}" alt=""></figure><div><br></div>`
        : isVid
          ? `<figure class="nt-media"><video data-path="${path}" src="${local}" controls playsinline></video></figure><div><br></div>`
          : `<a class="nt-file" data-path="${path}" data-name="${escAttr(f.name)}" data-size="${f.size}">${escAttr(f.name)} · ${size(f.size)}</a><div><br></div>`;
      cmd("insertHTML", html);
      if (ref.current) prepare(ref.current);
    }
    setBusy("");
  }

  // Клик по кружку чек-листа ставит галочку; клик по ссылке или файлу открывает его
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const li = t.closest("ul.nt-check > li") as HTMLLIElement | null;
    if (li && e.clientX - li.getBoundingClientRect().left < 30) {
      e.preventDefault();
      li.setAttribute("data-done", li.getAttribute("data-done") === "true" ? "false" : "true");
      emit();
      return;
    }
    const a = t.closest("a") as HTMLAnchorElement | null;
    if (a?.href && (e.metaKey || e.ctrlKey || a.classList.contains("nt-file"))) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || !ref.current) return;
    // Браузер копирует галочку в новый пункт — снимаем её со всех только что появившихся пунктов
    const before = new Set(Array.from(ref.current.querySelectorAll("ul.nt-check > li")));
    setTimeout(() => {
      ref.current?.querySelectorAll("ul.nt-check > li").forEach((li) => { if (!before.has(li) || !li.hasAttribute("data-done")) li.setAttribute("data-done", "false"); });
      emit();
    }, 0);
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); upload(files); return; }
    const html = e.clipboardData.getData("text/html");
    if (html) { e.preventDefault(); document.execCommand("insertHTML", false, sanitize(html)); emit(); }
  }

  return (
    <div className="ne">
      <div className="ne-bar" role="toolbar" aria-label="Форматирование" onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
        <span className="ne-aa-wrap">
          <button type="button" className={`ne-btn ne-aa ${aa ? "on" : ""}`} onClick={() => setAa(!aa)} title="Стиль текста">Aa</button>
          {aa && (
            <div className="ne-aa-menu">
              <button type="button" onClick={() => block("h1")}><b style={{ fontSize: 20 }}>Заголовок</b></button>
              <button type="button" onClick={() => block("h2")}><b style={{ fontSize: 16 }}>Подзаголовок</b></button>
              <button type="button" onClick={() => block("div")}>Основной текст</button>
              <button type="button" onClick={() => block("pre")}><code>Моноширинный</code></button>
              <button type="button" onClick={() => block("blockquote")}>│ Цитата</button>
            </div>
          )}
        </span>
        <i className="ne-sep" />
        <button type="button" className={`ne-btn ${state.bold ? "on" : ""}`} onClick={() => cmd("bold")} title="Жирный (⌘B)"><b>B</b></button>
        <button type="button" className={`ne-btn ${state.italic ? "on" : ""}`} onClick={() => cmd("italic")} title="Курсив (⌘I)"><i style={{ fontFamily: "serif" }}>I</i></button>
        <button type="button" className={`ne-btn ${state.underline ? "on" : ""}`} onClick={() => cmd("underline")} title="Подчёркнутый (⌘U)"><u>U</u></button>
        <button type="button" className={`ne-btn ${state.strike ? "on" : ""}`} onClick={() => cmd("strikeThrough")} title="Зачёркнутый"><s>S</s></button>
        <i className="ne-sep" />
        <button type="button" className="ne-btn" onClick={checklist} title="Чек-лист">☑</button>
        <button type="button" className="ne-btn" onClick={() => cmd("insertUnorderedList")} title="Маркированный список">•≡</button>
        <button type="button" className="ne-btn" onClick={() => cmd("insertOrderedList")} title="Нумерованный список">1.</button>
        <button type="button" className="ne-btn" onClick={link} title="Ссылка">🔗</button>
        <i className="ne-sep" />
        <button type="button" className="ne-btn" onClick={() => imgInput.current?.click()} title="Фото или видео">🖼</button>
        <button type="button" className="ne-btn" onClick={() => fileInput.current?.click()} title="Файл">📎</button>
        <button type="button" className="ne-btn" onClick={insertDate} title="Дата и время">🗓</button>
        {busy && <span className="ne-busy">{busy}</span>}
        <input ref={imgInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      </div>
      <div
        ref={ref}
        className="ne-doc"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder="Заголовок"
        onInput={emit}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}
      />
    </div>
  );
}

function prepare(el: HTMLElement) {
  // Фото, видео и файлы — цельные блоки, их не редактируют по буквам
  el.querySelectorAll("figure.nt-media, a.nt-file").forEach((n) => n.setAttribute("contenteditable", "false"));
}

function placeCaret(node: Node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  r.collapse(true);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
  (node instanceof HTMLElement ? node : node.parentElement)?.closest<HTMLElement>("[contenteditable]")?.focus();
}
