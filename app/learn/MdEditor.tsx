"use client";

import { useRef, useState } from "react";

type Mark = { open: string; close: string };
const MARKS: Record<string, Mark> = {
  bold: { open: "**", close: "**" },
  italic: { open: "*", close: "*" },
  underline: { open: "__", close: "__" },
  strike: { open: "~~", close: "~~" },
  mono: { open: "`", close: "`" },
  spoiler: { open: "||", close: "||" },
};
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** Редактор статьи с форматированием как в Telegram: выделил текст — нажал ⌘/Ctrl+B и т.д., или кнопки на всплывающей панели */
export function MdEditor({ value, onChange, rows = 18 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState(false);

  const apply = (next: string, start: number, end: number) => {
    onChange(next);
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(start, end); } });
  };

  /** Обернуть выделение маркерами; если уже обёрнуто — снять */
  function wrap(kind: keyof typeof MARKS) {
    const el = ta.current; if (!el) return;
    const { open, close } = MARKS[kind];
    let s = el.selectionStart, e = el.selectionEnd;
    // не захватываем пробелы по краям — иначе Markdown не сработает
    while (s < e && /\s/.test(value[s])) s++;
    while (e > s && /\s/.test(value[e - 1])) e--;
    const text = value.slice(s, e);
    if (value.slice(s - open.length, s) === open && value.slice(e, e + close.length) === close) {
      return apply(value.slice(0, s - open.length) + text + value.slice(e + close.length), s - open.length, e - open.length);
    }
    if (text.startsWith(open) && text.endsWith(close) && text.length >= open.length + close.length) {
      const inner = text.slice(open.length, text.length - close.length);
      return apply(value.slice(0, s) + inner + value.slice(e), s, s + inner.length);
    }
    const body = text || (kind === "mono" ? "код" : "текст");
    apply(value.slice(0, s) + open + body + close + value.slice(e), s + open.length, s + open.length + body.length);
  }

  function link() {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const text = value.slice(s, e) || "ссылка";
    const url = window.prompt("Адрес ссылки", "https://");
    if (!url || url === "https://") return;
    const md = `[${text}](${/^https?:\/\//.test(url) ? url : `https://${url}`})`;
    apply(value.slice(0, s) + md + value.slice(e), s + 1, s + 1 + text.length);
  }

  /** Снять всё форматирование в выделении (как Ctrl+Shift+N в Telegram) */
  function clear() {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const text = value.slice(s, e).replace(/\*\*|__|~~|\|\||`|\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    apply(value.slice(0, s) + text + value.slice(e), s, s + text.length);
  }

  /** Блочные элементы: заголовок, список, цитата — ставятся в начало строки */
  function line(prefix: string) {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const lineEnd = value.indexOf("\n", s) === -1 ? value.length : value.indexOf("\n", s);
    const cur = value.slice(start, lineEnd).replace(/^(#{1,3}\s|[-*]\s|\d+\.\s|>\s?!\s?|>\s?)/, "");
    const has = value.slice(start, lineEnd).startsWith(prefix);
    const next = value.slice(0, start) + (has ? "" : prefix) + cur + value.slice(lineEnd);
    const caret = start + (has ? 0 : prefix.length) + cur.length;
    apply(next, caret, caret);
  }

  function insert(block: string) {
    const el = ta.current; if (!el) return;
    const s = el.selectionStart;
    const before = value.slice(0, s), after = value.slice(s);
    const pad = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = before + pad + block + "\n\n" + after.replace(/^\n+/, "");
    const caret = (before + pad + block).length;
    apply(next, caret, caret);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    const code = e.code;
    const hit = (fn: () => void) => { e.preventDefault(); fn(); };
    // русская раскладка: те же клавиши (и, ш, г, л)
    if (!e.shiftKey && (k === "b" || k === "и" || code === "KeyB")) return hit(() => wrap("bold"));
    if (!e.shiftKey && (k === "i" || k === "ш" || code === "KeyI")) return hit(() => wrap("italic"));
    if (!e.shiftKey && (k === "u" || k === "г" || code === "KeyU")) return hit(() => wrap("underline"));
    if (!e.shiftKey && (k === "k" || k === "л" || code === "KeyK")) return hit(link);
    if (e.shiftKey && (code === "KeyX" || k === "x" || k === "ч")) return hit(() => wrap("strike"));
    if (e.shiftKey && (code === "KeyM" || k === "m" || k === "ь")) return hit(() => wrap("mono"));
    if (e.shiftKey && (code === "KeyP" || k === "p" || k === "з")) return hit(() => wrap("spoiler"));
    if (e.shiftKey && (code === "KeyN" || k === "n" || k === "т")) return hit(clear);
  }

  const B = ({ t, title, on }: { t: React.ReactNode; title: string; on: () => void }) => (
    <button type="button" className="md-btn" title={title} onMouseDown={(e) => e.preventDefault()} onClick={on}>{t}</button>
  );

  return (
    <div className="md">
      <div className="md-bar">
        <B t="H1" title="Заголовок раздела" on={() => line("# ")} />
        <B t="H2" title="Подзаголовок" on={() => line("## ")} />
        <i className="md-sep" />
        <B t={<b>B</b>} title={`Жирный · ${MOD}+B`} on={() => wrap("bold")} />
        <B t={<i style={{ fontFamily: "serif" }}>I</i>} title={`Курсив · ${MOD}+I`} on={() => wrap("italic")} />
        <B t={<u>U</u>} title={`Подчёркнутый · ${MOD}+U`} on={() => wrap("underline")} />
        <B t={<s>S</s>} title={`Зачёркнутый · ${MOD}+Shift+X`} on={() => wrap("strike")} />
        <B t={<code>{"</>"}</code>} title={`Моноширинный · ${MOD}+Shift+M`} on={() => wrap("mono")} />
        <B t="▒" title={`Спойлер · ${MOD}+Shift+P`} on={() => wrap("spoiler")} />
        <B t="🔗" title={`Ссылка · ${MOD}+K`} on={link} />
        <i className="md-sep" />
        <B t="•" title="Список" on={() => line("- ")} />
        <B t="1." title="Шаги" on={() => line("1. ")} />
        <B t="❝" title="Цитата" on={() => line("> ")} />
        <B t="💡" title="Выноска" on={() => line("> ! ")} />
        <B t="—" title="Разделитель" on={() => insert("---")} />
        <B t="🖼" title="Картинка по ссылке" on={() => { const u = window.prompt("Ссылка на картинку (https://…)"); if (u) insert(`![](${u})`); }} />
      </div>
      <div className="md-wrap">
        {sel && (
          <div className="md-float" role="toolbar" aria-label="Форматирование выделенного">
            <B t={<b>B</b>} title={`Жирный · ${MOD}+B`} on={() => wrap("bold")} />
            <B t={<i style={{ fontFamily: "serif" }}>I</i>} title={`Курсив · ${MOD}+I`} on={() => wrap("italic")} />
            <B t={<u>U</u>} title={`Подчёркнутый · ${MOD}+U`} on={() => wrap("underline")} />
            <B t={<s>S</s>} title={`Зачёркнутый · ${MOD}+Shift+X`} on={() => wrap("strike")} />
            <B t={<code>{"</>"}</code>} title={`Моноширинный · ${MOD}+Shift+M`} on={() => wrap("mono")} />
            <B t="▒" title={`Спойлер · ${MOD}+Shift+P`} on={() => wrap("spoiler")} />
            <B t="🔗" title={`Ссылка · ${MOD}+K`} on={link} />
            <B t="✕" title={`Убрать форматирование · ${MOD}+Shift+N`} on={clear} />
          </div>
        )}
        <textarea
          ref={ta}
          className="ae-body md-area"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onSelect={(e) => setSel(e.currentTarget.selectionEnd > e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setSel(false), 150)}
          placeholder={"Пиши как в Telegram: выдели слово и нажми " + MOD + "+B — будет жирным"}
        />
      </div>
      <p className="md-keys">
        <kbd>{MOD}+B</kbd> жирный · <kbd>{MOD}+I</kbd> курсив · <kbd>{MOD}+U</kbd> подчёркнутый · <kbd>{MOD}+⇧+X</kbd> зачёркнутый · <kbd>{MOD}+⇧+M</kbd> моноширинный · <kbd>{MOD}+⇧+P</kbd> спойлер · <kbd>{MOD}+K</kbd> ссылка · <kbd>{MOD}+⇧+N</kbd> убрать
      </p>
    </div>
  );
}
