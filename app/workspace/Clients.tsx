"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  OUTCOME, QUALIFY, download, loadSettings, parseTable, saveSettings, toCsv,
  type Client, type ClientColumn,
} from "@/lib/workspace";

type Col = { key: string; title: string; type: "text" | "select" | "number" | "date" | "user"; options?: { v: string; c?: string }[]; width: number; custom?: boolean; long?: boolean };
type Sort = { key: string; dir: 1 | -1 } | null;

const BASE: Col[] = [
  { key: "username", title: "@username", type: "user", width: 170 },
  { key: "sphere", title: "Сфера деятельности", type: "text", width: 190 },
  { key: "qualify", title: "Квалифай", type: "select", options: QUALIFY, width: 140 },
  { key: "hypothesis", title: "Гипотеза", type: "text", width: 260, long: true },
  { key: "outcome", title: "Итог сделки", type: "select", options: OUTCOME, width: 140 },
  { key: "comment", title: "Комментарий", type: "text", width: 280, long: true },
];
const FIXED = new Set(BASE.map((c) => c.key));

const getVal = (r: Client, key: string) => (FIXED.has(key) ? String((r as unknown as Record<string, string>)[key] ?? "") : r.extra?.[key] ?? "");

export function Clients({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Client[] | null>(null);
  const [custom, setCustom] = useState<ClientColumn[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<{ qualify?: string; outcome?: string }>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [colEditor, setColEditor] = useState(false);
  const [toast, setToast] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    (async () => {
      const [s, { data }] = await Promise.all([
        loadSettings(userId),
        supabase.from("clients").select("*").eq("user_id", userId).order("position").order("created_at"),
      ]);
      setCustom(s.client_columns ?? []);
      setRows((data as Client[]) ?? []);
    })();
    try { setWidths(JSON.parse(localStorage.getItem("clients:widths") ?? "{}")); } catch {}
  }, [userId]);

  const columns: Col[] = useMemo(() => [
    ...BASE,
    ...custom.map((c) => ({
      key: c.id, title: c.title, type: c.type, custom: true, width: 160,
      options: c.options?.map((v) => ({ v })),
    })),
  ].map((c) => ({ ...c, width: widths[c.key] ?? c.width })), [custom, widths]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2200); };

  // Видимые строки: поиск, фильтры, сортировка
  const view = useMemo(() => {
    let list = rows ?? [];
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => columns.some((c) => getVal(r, c.key).toLowerCase().includes(s)));
    if (filter.qualify) list = list.filter((r) => r.qualify === filter.qualify);
    if (filter.outcome) list = list.filter((r) => r.outcome === filter.outcome);
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      list = [...list].sort((a, b) => {
        const x = getVal(a, sort.key), y = getVal(b, sort.key);
        if (col?.type === "number") return ((parseFloat(x) || 0) - (parseFloat(y) || 0)) * sort.dir;
        if (!x && y) return 1;
        if (x && !y) return -1;
        return x.localeCompare(y, "ru") * sort.dir;
      });
    }
    return list;
  }, [rows, q, filter, sort, columns]);

  // Сохранение ячейки с задержкой, чтобы не дёргать базу на каждую букву
  const persist = useCallback((row: Client) => {
    const t = saveTimers.current.get(row.id);
    if (t) clearTimeout(t);
    saveTimers.current.set(row.id, setTimeout(async () => {
      const { id, username, sphere, qualify, hypothesis, outcome, comment, extra } = row;
      const { error } = await supabase.from("clients").update({ username, sphere, qualify, hypothesis, outcome, comment, extra, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) flash("Не сохранилось. Проверь интернет.");
    }, 400));
  }, []);

  const setCell = useCallback((rowId: string, key: string, value: string) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.id !== rowId) return r;
        const clean = key === "username" ? value.trim().replace(/^@+/, "") : value;
        const next = FIXED.has(key) ? { ...r, [key]: clean } : { ...r, extra: { ...r.extra, [key]: clean } };
        persist(next as Client);
        return next as Client;
      });
    });
  }, [persist]);

  async function addRow(at?: number) {
    const last = rows?.[rows.length - 1];
    const { data, error } = await supabase.from("clients").insert({ position: (last?.position ?? 0) + 1 }).select("*").single();
    if (error || !data) return flash("Не получилось добавить строку");
    setRows((prev) => [...(prev ?? []), data as Client]);
    setSort(null);
    const r = at ?? (rows?.length ?? 0);
    setSel({ r, c: 0 });
    setTimeout(() => grid.current?.focus(), 0);
    return data as Client;
  }

  async function removeChecked() {
    const ids = [...checked];
    if (!ids.length) return;
    await supabase.from("clients").delete().in("id", ids);
    setRows((prev) => (prev ?? []).filter((r) => !checked.has(r.id)));
    setChecked(new Set());
    setSel(null);
    flash(`Удалено: ${ids.length}`);
  }

  // Вставка блока из Excel / Google Таблиц начиная с выбранной ячейки
  async function pasteBlock(text: string) {
    if (!sel) return;
    const block = parseTable(text);
    if (!block.length) return;
    let list = [...view];
    const need = sel.r + block.length - list.length;
    if (need > 0) {
      const base = (rows?.[rows.length - 1]?.position ?? 0) + 1;
      const { data } = await supabase.from("clients").insert(Array.from({ length: need }, (_, i) => ({ position: base + i }))).select("*");
      if (data) { list = [...list, ...(data as Client[])]; setRows((prev) => [...(prev ?? []), ...(data as Client[])]); }
    }
    block.forEach((cells, i) => {
      const row = list[sel.r + i];
      if (!row) return;
      cells.forEach((v, j) => { const col = columns[sel.c + j]; if (col) setCell(row.id, col.key, v.trim()); });
    });
    flash(`Вставлено строк: ${block.length}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (editing || !sel) return;
    const maxR = view.length - 1, maxC = columns.length - 1;
    const move = (r: number, c: number) => { e.preventDefault(); setSel({ r: Math.max(0, Math.min(maxR, r)), c: Math.max(0, Math.min(maxC, c)) }); };
    const row = view[sel.r];
    switch (e.key) {
      case "ArrowUp": return move(sel.r - 1, sel.c);
      case "ArrowDown": return move(sel.r + 1, sel.c);
      case "ArrowLeft": return move(sel.r, sel.c - 1);
      case "ArrowRight": return move(sel.r, sel.c + 1);
      case "Tab": return move(sel.r, sel.c + (e.shiftKey ? -1 : 1));
      case "Enter": e.preventDefault(); if (row) setEditing({ ...sel, value: getVal(row, columns[sel.c].key) }); return;
      case "Backspace": case "Delete": e.preventDefault(); if (row) setCell(row.id, columns[sel.c].key, ""); return;
      case "Escape": setSel(null); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && row) {
      navigator.clipboard?.writeText(getVal(row, columns[sel.c].key)).catch(() => {});
      flash("Скопировано");
      return;
    }
    // Начали печатать — сразу режим ввода, как в Excel
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && row && columns[sel.c].type !== "select") {
      e.preventDefault();
      setEditing({ ...sel, value: e.key });
    }
  }

  function commit(next?: { r: number; c: number }) {
    if (!editing) return;
    const row = view[editing.r];
    if (row) setCell(row.id, columns[editing.c].key, editing.value);
    setEditing(null);
    if (next) setSel({ r: Math.min(next.r, view.length - 1), c: Math.min(next.c, columns.length - 1) });
    setTimeout(() => grid.current?.focus(), 0);
  }

  function exportCsv() {
    const head = columns.map((c) => c.title);
    const body = view.map((r) => columns.map((c) => (c.key === "username" && r.username ? "@" + r.username : getVal(r, c.key))));
    download(`clients-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]));
  }

  async function importCsv(file: File) {
    const table = parseTable(await file.text());
    if (table.length < 2) return flash("В файле нет строк");
    const head = table[0].map((h) => h.trim().toLowerCase());
    const idx = (key: string, title: string) => head.findIndex((h) => h === title.toLowerCase() || h === key);
    const map = columns.map((c) => ({ c, i: idx(c.key, c.title) }));
    const base = (rows?.[rows.length - 1]?.position ?? 0) + 1;
    const payload = table.slice(1).map((cells, n) => {
      const r: Record<string, unknown> = { position: base + n, extra: {} };
      for (const { c, i } of map) {
        if (i < 0) continue;
        const v = (cells[i] ?? "").trim();
        if (FIXED.has(c.key)) r[c.key] = c.key === "username" ? v.replace(/^@+/, "") : v;
        else (r.extra as Record<string, string>)[c.key] = v;
      }
      return r;
    });
    const { data, error } = await supabase.from("clients").insert(payload).select("*");
    if (error) return flash("Не получилось загрузить файл");
    setRows((prev) => [...(prev ?? []), ...((data as Client[]) ?? [])]);
    flash(`Загружено строк: ${data?.length ?? 0}`);
  }

  function startResize(key: string, startX: number, startW: number) {
    const onMove = (e: PointerEvent) => setWidths((w) => ({ ...w, [key]: Math.max(90, Math.min(600, startW + e.clientX - startX)) }));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidths((w) => { try { localStorage.setItem("clients:widths", JSON.stringify(w)); } catch {} return w; });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (!rows) return <div className="skeleton profile-skeleton" />;

  const stats = OUTCOME.map((o) => ({ ...o, n: rows.filter((r) => r.outcome === o.v).length }));
  const allChecked = view.length > 0 && view.every((r) => checked.has(r.id));
  const template = `44px ${columns.map((c) => `${c.width}px`).join(" ")} 44px`;

  return (
    <div className="ws-section">
      <div className="ws-stats">
        <div className="ws-stat"><b>{rows.length}</b><span>клиентов</span></div>
        {stats.map((s) => (
          <button key={s.v} type="button" className={`ws-stat clickable ${filter.outcome === s.v ? "on" : ""}`}
            onClick={() => setFilter((f) => ({ ...f, outcome: f.outcome === s.v ? undefined : s.v }))}>
            <b>{s.n}</b><span><i style={{ background: s.c }} />{s.v}</span>
          </button>
        ))}
      </div>

      <div className="sheet-toolbar">
        <div className="input sheet-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по таблице" aria-label="Поиск по таблице" /></div>
        <select className="mini-select" value={filter.qualify ?? ""} onChange={(e) => setFilter((f) => ({ ...f, qualify: e.target.value || undefined }))} aria-label="Фильтр по квалифаю">
          <option value="">Квалифай: все</option>
          {QUALIFY.map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
        </select>
        <div className="sheet-actions">
          {checked.size > 0 && <button type="button" className="btn danger sm" onClick={removeChecked}>Удалить ({checked.size})</button>}
          <button type="button" className="btn ghost sm" onClick={() => setColEditor(true)}>Колонки</button>
          <label className="btn ghost sm">Импорт CSV<input type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} /></label>
          <button type="button" className="btn ghost sm" onClick={exportCsv}>Экспорт</button>
          <button type="button" className="btn sm" onClick={() => addRow()}>+ Клиент</button>
        </div>
      </div>

      <div
        className="sheet" ref={grid} tabIndex={0} onKeyDown={onKeyDown}
        onPaste={(e) => { if (!editing && sel) { e.preventDefault(); pasteBlock(e.clipboardData.getData("text")); } }}
        role="grid" aria-label="Таблица клиентов" aria-rowcount={view.length + 1}
      >
        <div className="sheet-row head" style={{ gridTemplateColumns: template }} role="row">
          <div className="sheet-cell idx" role="columnheader">
            <input type="checkbox" checked={allChecked} aria-label="Выбрать все"
              onChange={() => setChecked(allChecked ? new Set() : new Set(view.map((r) => r.id)))} />
          </div>
          {columns.map((c) => (
            <div key={c.key} className="sheet-cell th" role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 1 } : s.dir === 1 ? { key: c.key, dir: -1 } : null))}>
                {c.title}<span className="sort">{sort?.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
              </button>
              <span className="resizer" onPointerDown={(e) => { e.preventDefault(); startResize(c.key, e.clientX, c.width); }} />
            </div>
          ))}
          <div className="sheet-cell th" />
        </div>

        {view.map((r, ri) => (
          <div key={r.id} className={`sheet-row ${checked.has(r.id) ? "picked" : ""}`} style={{ gridTemplateColumns: template }} role="row">
            <div className="sheet-cell idx">
              <span className="rownum">{ri + 1}</span>
              <input type="checkbox" checked={checked.has(r.id)} aria-label={`Выбрать строку ${ri + 1}`}
                onChange={() => setChecked((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
            </div>
            {columns.map((c, ci) => {
              const isSel = sel?.r === ri && sel?.c === ci;
              const isEdit = editing?.r === ri && editing?.c === ci;
              const v = getVal(r, c.key);
              return (
                <div key={c.key} role="gridcell"
                  className={`sheet-cell ${isSel ? "sel" : ""} ${isEdit ? "editing" : ""} ${c.long ? "long" : ""}`}
                  onMouseDown={() => { if (!isEdit) { commit(); setSel({ r: ri, c: ci }); } }}
                  onDoubleClick={() => c.type !== "select" && setEditing({ r: ri, c: ci, value: v })}
                >
                  {c.type === "select" ? (
                    <SelectCell value={v} options={c.options ?? []} onChange={(nv) => setCell(r.id, c.key, nv)} />
                  ) : isEdit ? (
                    <CellEditor
                      value={editing.value} long={c.long} type={c.type}
                      onChange={(value) => setEditing({ ...editing, value })}
                      onCommit={(dir) => commit(dir === "down" ? { r: ri + 1, c: ci } : dir === "right" ? { r: ri, c: ci + 1 } : dir === "left" ? { r: ri, c: ci - 1 } : undefined)}
                      onCancel={() => { setEditing(null); grid.current?.focus(); }}
                    />
                  ) : (
                    <span className={`cell-text ${c.type === "user" && v ? "user" : ""}`}>{c.type === "user" && v ? `@${v}` : v}</span>
                  )}
                </div>
              );
            })}
            <div className="sheet-cell end">
              <button type="button" className="icon-btn sm" aria-label="Удалить строку"
                onClick={async () => { await supabase.from("clients").delete().eq("id", r.id); setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); }}>×</button>
            </div>
          </div>
        ))}

        <button type="button" className="sheet-add" onClick={() => addRow()}>+ Новая строка</button>
      </div>

      <p className="hint">
        Клик — выбрать ячейку, двойной клик или Enter — редактировать, стрелки и Tab — перемещаться, Delete — очистить.
        Можно вставить диапазон из Excel или Google Таблиц через Ctrl+V / ⌘V.
      </p>

      {toast && <div className="toast" role="status">{toast}</div>}
      {colEditor && (
        <ColumnEditor
          columns={custom}
          onClose={() => setColEditor(false)}
          onSave={async (next) => { setCustom(next); await saveSettings(userId, { client_columns: next }); setColEditor(false); flash("Колонки сохранены"); }}
        />
      )}
    </div>
  );
}

function CellEditor({ value, long, type, onChange, onCommit, onCancel }: {
  value: string; long?: boolean; type: Col["type"];
  onChange: (v: string) => void; onCommit: (dir?: "down" | "right" | "left") => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange?.(end, end);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(long && e.altKey)) { e.preventDefault(); onCommit("down"); }
    else if (e.key === "Tab") { e.preventDefault(); onCommit(e.shiftKey ? "left" : "right"); }
    else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };
  if (type === "date" || type === "number") {
    return <input ref={ref} className="cell-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onBlur={() => onCommit()} />;
  }
  return <textarea ref={ref} className="cell-input" rows={long ? 3 : 1} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onBlur={() => onCommit()} />;
}

function SelectCell({ value, options, onChange }: { value: string; options: { v: string; c?: string }[]; onChange: (v: string) => void }) {
  const opt = options.find((o) => o.v === value);
  return (
    <span className="select-cell">
      {value ? (
        <span className="pill" style={{ "--c": opt?.c ?? "#8A8A87" } as React.CSSProperties}><i />{value}</span>
      ) : <span className="pill empty">выбрать</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Выбрать значение">
        <option value="">—</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
      </select>
    </span>
  );
}

function ColumnEditor({ columns, onClose, onSave }: { columns: ClientColumn[]; onClose: () => void; onSave: (c: ClientColumn[]) => void }) {
  const [list, setList] = useState<ClientColumn[]>(columns);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ClientColumn["type"]>("text");
  const [opts, setOpts] = useState("");
  return (
    <div className="sheet-modal" role="dialog" aria-label="Свои колонки" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-body card">
        <header className="modal-head"><h2 className="h-md caps">Свои <span className="it">колонки</span></h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button></header>
        <p className="lead small">Базовые колонки остаются всегда. Добавь свои: бюджет, источник, дата созвона.</p>
        <ul className="section-order">
          {list.map((c, i) => (
            <li key={c.id} className="on">
              <span><b>{c.title}</b> <span className="hint">{{ text: "текст", select: "список", number: "число", date: "дата" }[c.type]}{c.options?.length ? `: ${c.options.join(", ")}` : ""}</span></span>
              <button type="button" className="icon-btn sm" aria-label="Удалить колонку" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
        <form className="col-add" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setList([...list, { id: `c_${crypto.randomUUID().slice(0, 8)}`, title: title.trim().slice(0, 40), type, options: type === "select" ? opts.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12) : undefined }]);
          setTitle(""); setOpts("");
        }}>
          <div className="input"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название колонки" maxLength={40} aria-label="Название колонки" /></div>
          <div className="input">
            <select value={type} onChange={(e) => setType(e.target.value as ClientColumn["type"])} aria-label="Тип колонки">
              <option value="text">Текст</option><option value="number">Число</option><option value="date">Дата</option><option value="select">Список</option>
            </select>
          </div>
          {type === "select" && <div className="input"><input value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Варианты через запятую" aria-label="Варианты" /></div>}
          <button type="submit" className="btn ghost sm" disabled={!title.trim()}>Добавить</button>
        </form>
        <div className="editor-actions"><button type="button" className="btn" onClick={() => onSave(list)}>Сохранить</button></div>
      </div>
    </div>
  );
}
