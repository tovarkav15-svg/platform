// Заметки с форматированием: тело хранится как очищенный HTML. Медиа — путь в закрытом хранилище (data-path),
// ссылка на файл подставляется при открытии и в базу не попадает
import { supabase } from "./supabase";

const ALLOWED = new Set(["DIV", "P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "VIDEO", "SPAN", "FIGURE", "PRE", "CODE", "HR"]);
const ATTRS: Record<string, string[]> = {
  A: ["href", "data-path", "data-name", "data-size", "class"],
  IMG: ["data-path", "alt"],
  VIDEO: ["data-path"],
  UL: ["class"],
  LI: ["data-done"],
  FIGURE: ["class"],
  SPAN: ["class"],
};

export const isHtml = (s: string) => /^\s*</.test(s);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Старые текстовые заметки → HTML: первая строка заголовком, ☐/☑ — чек-лист, • — список */
export function fromPlain(text: string) {
  const lines = text.split("\n");
  let out = "", list: "check" | "bullet" | null = null;
  const close = () => { if (list) { out += "</ul>"; list = null; } };
  lines.forEach((raw, i) => {
    const m = raw.match(/^([☐☑•])\s?(.*)$/);
    if (m) {
      const kind = m[1] === "•" ? "bullet" : "check";
      if (list !== kind) { close(); out += kind === "check" ? '<ul class="nt-check">' : "<ul>"; list = kind; }
      out += kind === "check" ? `<li data-done="${m[1] === "☑"}">${esc(m[2]) || "<br>"}</li>` : `<li>${esc(m[2]) || "<br>"}</li>`;
      return;
    }
    close();
    if (i === 0 && raw.trim()) out += `<h1>${esc(raw)}</h1>`;
    else out += `<div>${esc(raw) || "<br>"}</div>`;
  });
  close();
  return out;
}

/** Оставляем только безопасные теги и атрибуты */
export function sanitize(html: string) {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node: Element) => {
    Array.from(node.children).forEach((el) => {
      if (!ALLOWED.has(el.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(el.tagName)) { el.remove(); return; }
        // неизвестный тег разворачиваем, сохраняя текст
        const frag = doc.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.replaceWith(frag);
        walk(node);
        return;
      }
      Array.from(el.attributes).forEach((a) => {
        if (!(ATTRS[el.tagName] ?? []).includes(a.name)) el.removeAttribute(a.name);
      });
      if (el.tagName === "A") {
        const href = el.getAttribute("href") ?? "";
        if (href && !/^https?:\/\//i.test(href)) el.removeAttribute("href");
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
      }
      if (el.tagName === "VIDEO") el.setAttribute("controls", "");
      walk(el);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Перед сохранением убираем временные ссылки на файлы */
export function forSave(root: HTMLElement) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-path]").forEach((el) => { el.removeAttribute("src"); if (el.tagName === "A" && el.classList.contains("nt-file")) el.removeAttribute("href"); });
  clone.querySelectorAll(".nt-uploading").forEach((el) => el.remove());
  return clone.innerHTML;
}

export function plainText(html: string) {
  if (!isHtml(html)) return html;
  return html.replace(/<\/(h1|h2|h3|div|p|li|blockquote)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Подставить свежие ссылки на фото, видео и файлы заметки */
export async function hydrateMedia(root: HTMLElement) {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-path]"));
  const paths = Array.from(new Set(els.map((e) => e.dataset.path!).filter(Boolean)));
  if (!paths.length) return;
  const { data } = await supabase.storage.from("notes-media").createSignedUrls(paths, 60 * 60 * 6);
  const map = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  els.forEach((el) => {
    const url = map.get(el.dataset.path!);
    if (!url) return;
    if (el.tagName === "A") el.setAttribute("href", url); else el.setAttribute("src", url);
  });
}

export function mediaPaths(html: string) {
  return Array.from(html.matchAll(/data-path="([^"]+)"/g)).map((m) => m[1]);
}
