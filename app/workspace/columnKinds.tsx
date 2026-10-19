"use client";

// Типы колонок таблицы клиентов: цветные списки, теги, деньги, галочки, оценки и т.д.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientColumn } from "@/lib/workspace";

export type Kind = ClientColumn["type"];
export type Opt = { v: string; c: string };

/** Цвета вариантов: подписи нужны, чтобы цвет можно было выбрать не только глазами */
export const PALETTE = [
  { c: "#2F7BFF", n: "Синий" },
  { c: "#1FA67A", n: "Зелёный" },
  { c: "#E8B100", n: "Жёлтый" },
  { c: "#FF6A3D", n: "Оранжевый" },
  { c: "#E5484D", n: "Красный" },
  { c: "#FF4F8B", n: "Розовый" },
  { c: "#7B61FF", n: "Фиолетовый" },
  { c: "#0EA5B7", n: "Бирюзовый" },
  { c: "#8B5A2B", n: "Коричневый" },
  { c: "#8A8A87", n: "Серый" },
];
export const autoColor = (i: number) => PALETTE[i % PALETTE.length].c;

export const KINDS: { v: Kind; label: string; icon: string; hint: string }[] = [
  { v: "text", label: "Текст", icon: "Aa", hint: "Любые заметки" },
  { v: "select", label: "Список", icon: "◉", hint: "Один цветной вариант" },
  { v: "multi", label: "Теги", icon: "☰", hint: "Несколько вариантов" },
  { v: "number", label: "Число", icon: "#", hint: "Сумма внизу" },
  { v: "money", label: "Деньги", icon: "₽", hint: "Рубли, сумма внизу" },
  { v: "date", label: "Дата", icon: "◷", hint: "Календарь" },
  { v: "checkbox", label: "Галочка", icon: "☑", hint: "Да или нет" },
  { v: "rating", label: "Оценка", icon: "★", hint: "От 1 до 5" },
  { v: "link", label: "Ссылка", icon: "↗", hint: "Сайт, Figma, соцсеть" },
  { v: "phone", label: "Телефон", icon: "✆", hint: "Номер для звонка" },
  { v: "email", label: "Почта", icon: "@", hint: "Адрес почты" },
  { v: "created", label: "Дата добавления", icon: "⏱", hint: "Заполняется сама" },
];
export const kindOf = (k: Kind) => KINDS.find((x) => x.v === k) ?? KINDS[0];

/** Готовые колонки в один клик */
export const PRESETS: { title: string; type: Kind; options?: string[] }[] = [
  { title: "Бюджет", type: "money" },
  { title: "Источник", type: "select", options: ["Telegram", "Instagram", "Сарафан", "Сайт", "Холодный поиск"] },
  { title: "Ниша", type: "multi", options: ["ИИ", "Монтаж", "Дизайн", "Инфобиз", "E-commerce"] },
  { title: "Дата созвона", type: "date" },
  { title: "Следующий шаг", type: "text" },
  { title: "Написал", type: "checkbox" },
  { title: "Оценка лида", type: "rating" },
  { title: "Телефон", type: "phone" },
  { title: "Почта", type: "email" },
  { title: "Сайт", type: "link" },
  { title: "Добавлен", type: "created" },
];

/** Колонки, которые меняются кликом, а не вводом текста */
export const NO_TYPING = new Set<string>(["select", "multi", "checkbox", "rating", "created"]);
export const NUMERIC = new Set<string>(["number", "money", "rating"]);
export const WIDTH: Partial<Record<Kind, number>> = { checkbox: 100, rating: 130, money: 140, number: 120, date: 130, multi: 210, created: 130, link: 190, phone: 150, email: 190 };

/** Колонки «Дата добавления» берут дату из самой строки */
export const isCreatedKey = (key: string) => key.startsWith("created_");

export const splitMulti = (v: string) => v.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
export const joinMulti = (a: string[]) => Array.from(new Set(a)).join(", ");
export const isChecked = (v: string) => ["1", "true", "да", "yes", "✓", "+", "x", "х"].includes(v.trim().toLowerCase());
export const toNum = (v: string) => { const n = parseFloat(v.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

/** Варианты колонки с цветами: заданный цвет или по порядку из палитры */
export function optsOf(c: Pick<ClientColumn, "options" | "colors">, fallback: Opt[] = []): Opt[] {
  if (!c.options?.length) return fallback.map((o) => ({ ...o, c: c.colors?.[o.v] ?? o.c }));
  return c.options.map((v, i) => ({ v, c: c.colors?.[v] ?? fallback.find((f) => f.v === v)?.c ?? autoColor(i) }));
}

export function Pill({ o, onRemove }: { o: Opt; onRemove?: () => void }) {
  return (
    <span className="pill" style={{ "--c": o.c } as React.CSSProperties}>
      <i />{o.v}
      {onRemove && <button type="button" className="pill-x" aria-label={`Убрать ${o.v}`} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
    </span>
  );
}

const optFor = (opts: Opt[], v: string): Opt => opts.find((o) => o.v === v) ?? { v, c: "#8A8A87" };

/** Значение ячейки в режиме просмотра */
export function KindValue({ type, value, opts, onChange }: { type: Kind; value: string; opts: Opt[]; onChange?: (v: string) => void }) {
  if (type === "select") return value ? <Pill o={optFor(opts, value)} /> : <span className="pill empty">выбрать</span>;
  if (type === "multi") {
    const vals = splitMulti(value);
    return vals.length ? <span className="pills">{vals.map((v) => <Pill key={v} o={optFor(opts, v)} />)}</span> : <span className="pill empty">выбрать</span>;
  }
  if (type === "checkbox") {
    const on = isChecked(value);
    return (
      <button type="button" className="chk cell-chk" aria-pressed={on} aria-label={on ? "Снять галочку" : "Поставить галочку"}
        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange?.(on ? "" : "1"); }} />
    );
  }
  if (type === "rating") {
    const n = Math.max(0, Math.min(5, Math.round(toNum(value))));
    return (
      <span className="stars" role="radiogroup" aria-label="Оценка">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i} из 5`} className={i <= n ? "on" : ""}
            onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange?.(n === i ? "" : String(i)); }}>★</button>
        ))}
      </span>
    );
  }
  if (!value) return null;
  if (type === "money") return <span className="cell-num">{fmtMoney(toNum(value))}</span>;
  if (type === "number") return <span className="cell-num">{value}</span>;
  if (type === "date" || type === "created") {
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return <span>{Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}</span>;
  }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (type === "link") {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return <a className="cell-link" href={href} target="_blank" rel="noopener noreferrer nofollow" onMouseDown={stop} onDoubleClick={stop}>{value.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</a>;
  }
  if (type === "phone") return <a className="cell-link" href={`tel:${value.replace(/[^\d+]/g, "")}`} onMouseDown={stop} onDoubleClick={stop}>{value}</a>;
  if (type === "email") return <a className="cell-link" href={`mailto:${value}`} onMouseDown={stop} onDoubleClick={stop}>{value}</a>;
  return null;
}

/** Выбор варианта: поиск, цветные варианты, создание нового прямо отсюда */
export function OptionPicker({ x, y, opts, value, multi, canCreate, onChange, onCreate, onClose }: {
  x: number; y: number; opts: Opt[]; value: string; multi: boolean; canCreate: boolean;
  onChange: (v: string) => void; onCreate: (name: string) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const chosen = multi ? splitMulti(value) : value ? [value] : [];
  const list = useMemo(() => opts.filter((o) => o.v.toLowerCase().includes(q.trim().toLowerCase())), [opts, q]);
  const exact = opts.find((o) => o.v.toLowerCase() === q.trim().toLowerCase());
  const showCreate = canCreate && q.trim() && !exact;

  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); };
  }, []);
  useEffect(() => setHi(0), [q]);

  const pick = (v: string) => {
    if (multi) onChange(joinMulti(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]));
    else { onChange(v === value ? "" : v); onClose(); }
    setQ("");
  };
  const create = () => {
    const name = q.trim().replace(/,/g, " ").slice(0, 40);
    if (!name) return;
    onCreate(name);
    if (multi) onChange(joinMulti([...chosen, name])); else { onChange(name); onClose(); }
    setQ("");
  };

  return (
    <div className="opt-picker card" ref={box} style={{ left: x, top: y }} role="dialog" aria-label="Выбор варианта">
      {chosen.length > 0 && multi && (
        <div className="pills opt-chosen">{chosen.map((v) => <Pill key={v} o={optFor(opts, v)} onRemove={() => pick(v)} />)}</div>
      )}
      <div className="input">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={canCreate ? "Найти или создать вариант" : "Найти вариант"} aria-label="Поиск варианта"
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - (showCreate ? 0 : 1))); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === "Enter") {
              e.preventDefault();
              if (hi < list.length) pick(list[hi].v); else if (showCreate) create();
            }
          }} />
      </div>
      <ul className="opt-list" role="listbox" aria-multiselectable={multi}>
        {list.map((o, i) => (
          <li key={o.v} role="option" aria-selected={chosen.includes(o.v)} className={i === hi ? "hi" : ""}
            onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.v)}>
            <Pill o={o} />{chosen.includes(o.v) && <span className="opt-check" aria-hidden="true">✓</span>}
          </li>
        ))}
        {showCreate && (
          <li role="option" aria-selected={false} className={`opt-create ${hi >= list.length ? "hi" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={create}>
            + Создать <Pill o={{ v: q.trim(), c: autoColor(opts.length) }} />
          </li>
        )}
        {!list.length && !showCreate && <li className="opt-empty">{opts.length ? "Ничего не нашлось" : "Вариантов пока нет"}</li>}
      </ul>
      {value && <button type="button" className="opt-clear" onClick={() => { onChange(""); if (!multi) onClose(); }}>Очистить</button>}
    </div>
  );
}

/** Редактор вариантов: цвет, удаление, новый вариант */
export function OptionsEditor({ opts, canEdit, onColor, onAdd, onRemove }: {
  opts: Opt[]; canEdit: boolean; onColor: (v: string, c: string) => void; onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [val, setVal] = useState("");
  return (
    <div className="opt-editor">
      <ul>
        {opts.map((o) => (
          <li key={o.v}>
            <button type="button" className="opt-swatch" style={{ background: o.c }} aria-label={`Цвет варианта ${o.v}`} aria-expanded={open === o.v} onClick={() => setOpen(open === o.v ? null : o.v)} />
            <Pill o={o} />
            {canEdit && <button type="button" className="icon-btn sm" aria-label={`Удалить вариант ${o.v}`} onClick={() => onRemove(o.v)}>×</button>}
            {open === o.v && (
              <div className="opt-palette" role="radiogroup" aria-label={`Цвет для ${o.v}`}>
                {PALETTE.map((p) => (
                  <button key={p.c} type="button" role="radio" aria-checked={o.c === p.c} aria-label={p.n} title={p.n}
                    className={o.c === p.c ? "on" : ""} style={{ background: p.c }} onClick={() => { onColor(o.v, p.c); setOpen(null); }} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!opts.length && <span className="hint">Пока пусто. Добавь первый вариант.</span>}
      {canEdit && (
        <form className="cm-add" onSubmit={(e) => { e.preventDefault(); const v = val.trim().replace(/,/g, " ").slice(0, 40); if (v && !opts.some((o) => o.v === v)) onAdd(v); setVal(""); }}>
          <div className="input"><input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Новый вариант" maxLength={40} aria-label="Новый вариант" /></div>
          <button type="submit" className="btn ghost sm" disabled={!val.trim()}>Добавить</button>
        </form>
      )}
    </div>
  );
}

/** Окно «+»: готовые колонки и все типы */
export function AddColumnMenu({ x, y, onPreset, onKind, onClose }: {
  x: number; y: number; onPreset: (p: (typeof PRESETS)[number]) => void; onKind: (k: Kind) => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);
  return (
    <div className="add-col-menu card" ref={box} style={{ left: x, top: y }} role="dialog" aria-label="Новая колонка">
      <span className="label">Готовые колонки</span>
      <div className="add-col-presets">
        {PRESETS.map((p) => (
          <button key={p.title} type="button" onClick={() => onPreset(p)}><i>{kindOf(p.type).icon}</i>{p.title}</button>
        ))}
      </div>
      <span className="label">Пустая колонка по типу</span>
      <div className="add-col-kinds">
        {KINDS.map((k) => (
          <button key={k.v} type="button" onClick={() => onKind(k.v)}><i>{k.icon}</i><span><b>{k.label}</b><small>{k.hint}</small></span></button>
        ))}
      </div>
    </div>
  );
}

/** Поле в карточке клиента под любой тип колонки */
export function KindField({ id, type, value, opts, canCreate, onChange, onCreate }: {
  id: string; type: Kind | "user"; value: string; opts: Opt[]; canCreate: boolean; onChange: (v: string) => void; onCreate: (name: string) => void;
}) {
  const [adding, setAdding] = useState("");
  if (type === "select" || type === "multi") {
    const chosen = type === "multi" ? splitMulti(value) : value ? [value] : [];
    const toggle = (v: string) => onChange(type === "multi" ? joinMulti(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]) : v === value ? "" : v);
    return (
      <div className="kf-opts" id={id}>
        {opts.map((o) => (
          <button key={o.v} type="button" className={`kf-opt ${chosen.includes(o.v) ? "on" : ""}`} style={{ "--c": o.c } as React.CSSProperties} aria-pressed={chosen.includes(o.v)} onClick={() => toggle(o.v)}>
            <i />{o.v}
          </button>
        ))}
        {canCreate && (
          <form onSubmit={(e) => { e.preventDefault(); const v = adding.trim().replace(/,/g, " ").slice(0, 40); if (!v) return; if (!opts.some((o) => o.v === v)) onCreate(v); toggle(v); setAdding(""); }}>
            <input className="kf-new" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ вариант" maxLength={40} aria-label="Новый вариант" />
          </form>
        )}
      </div>
    );
  }
  if (type === "checkbox" || type === "rating") return <div className="kf-inline"><KindValue type={type} value={value} opts={opts} onChange={onChange} /></div>;
  if (type === "created") return <div className="kf-inline"><KindValue type="created" value={value} opts={[]} /></div>;
  const inputType = type === "number" || type === "money" ? "number" : type === "date" ? "date" : type === "email" ? "email" : type === "phone" ? "tel" : type === "link" ? "url" : "text";
  return <input id={id} className="cd-input" type={inputType} value={value} placeholder={type === "user" ? "ник или ссылка" : type === "link" ? "https://" : ""} onChange={(e) => onChange(e.target.value)} />;
}
