"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CountUp } from "../CountUp";
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

const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

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
  const sp = useSearchParams();
  const [viewMode, setViewMode] = useState<"table" | "pipeline">(sp.get("view") === "pipeline" ? "pipeline" : "table");
  const autoAdded = useRef(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const markFresh = (ids: string[]) => { setFresh(new Set(ids)); setTimeout(() => setFresh(new Set()), 1400); };
  // Строка сначала уезжает, потом пропадает из таблицы
  const animateOut = (ids: string[]) => new Promise<void>((res) => { setLeaving(new Set(ids)); setTimeout(() => { setLeaving(new Set()); res(); }, 260); });
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
      if (sp.get("new") === "1" && !autoAdded.current) { autoAdded.current = true; setTimeout(() => addRowRef.current?.(), 0); }
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

  const addRowRef = useRef<(() => void) | null>(null);
  async function addRow(at?: number) {
    const last = rows?.[rows.length - 1];
    const { data, error } = await supabase.from("clients").insert({ position: (last?.position ?? 0) + 1 }).select("*").single();
    if (error || !data) return flash("Не получилось добавить строку");
    setRows((prev) => [...(prev ?? []), data as Client]);
    markFresh([data.id]);
    setSort(null);
    const r = at ?? (rows?.length ?? 0);
    setSel({ r, c: 0 });
    setTimeout(() => grid.current?.focus(), 0);
    return data as Client;
  }

  async function removeChecked() {
    const ids = [...checked];
    if (!ids.length) return;
    await animateOut(ids);
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
    markFresh(((data as Client[]) ?? []).map((d) => d.id));
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

  addRowRef.current = () => { setViewMode("table"); addRow(); };
  if (!rows) return <div className="skeleton profile-skeleton" />;

  const stats = OUTCOME.map((o) => ({ ...o, n: rows.filter((r) => r.outcome === o.v).length }));
  const allChecked = view.length > 0 && view.every((r) => checked.has(r.id));
  const template = `44px ${columns.map((c) => `${c.width}px`).join(" ")} 44px`;

  return (
    <div className="ws-section">
      <div className="ws-stats">
        <div className="ws-stat"><b><CountUp value={rows.length} /></b><span>клиентов</span></div>
        {stats.map((s) => (
          <button key={s.v} type="button" className={`ws-stat clickable ${filter.outcome === s.v ? "on" : ""}`}
            onClick={() => setFilter((f) => ({ ...f, outcome: f.outcome === s.v ? undefined : s.v }))}>
            <b><CountUp value={s.n} /></b><span><i style={{ background: s.c }} />{s.v}</span>
          </button>
        ))}
      </div>

      <div className="sheet-toolbar">
        <div className="seg small" role="tablist" aria-label="Вид">
          <button type="button" role="tab" className="seg-item" aria-current={viewMode === "table" ? "page" : undefined} onClick={() => setViewMode("table")}>Таблица</button>
          <button type="button" role="tab" className="seg-item" aria-current={viewMode === "pipeline" ? "page" : undefined} onClick={() => setViewMode("pipeline")}>Воронка</button>
        </div>
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

      {viewMode === "pipeline" ? (
        <Pipeline rows={view} onMove={(id, outcome) => setCell(id, "outcome", outcome)} onOpen={(id) => { setViewMode("table"); const r = view.findIndex((x) => x.id === id); setSel({ r, c: 0 }); }} />
      ) : (<>
      <FormulaBar
        address={sel ? `${letter(sel.c)}${sel.r + 1}` : ""}
        title={sel ? columns[sel.c]?.title : ""}
        value={sel && view[sel.r] ? (editing && editing.r === sel.r && editing.c === sel.c ? editing.value : getVal(view[sel.r], columns[sel.c].key)) : ""}
        disabled={!sel || !view[sel?.r ?? -1] || columns[sel?.c ?? 0]?.type === "select"}
        onChange={(v) => { if (sel && view[sel.r]) setCell(view[sel.r].id, columns[sel.c].key, v); }}
      />

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
          {columns.map((c, ci) => (
            <div key={c.key} className="sheet-cell th" role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 1 } : s.dir === 1 ? { key: c.key, dir: -1 } : null))}>
                <em className="col-letter">{letter(ci)}</em>{c.title}<span className="sort">{sort?.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
              </button>
              <span className="resizer" onPointerDown={(e) => { e.preventDefault(); startResize(c.key, e.clientX, c.width); }} />
            </div>
          ))}
          <div className="sheet-cell th" />
        </div>

        {view.map((r, ri) => (
          <div key={r.id} className={`sheet-row ${checked.has(r.id) ? "picked" : ""} ${fresh.has(r.id) ? "fresh" : ""} ${leaving.has(r.id) ? "leaving" : ""}`} style={{ gridTemplateColumns: template, "--i": Math.min(ri, 20) } as React.CSSProperties} role="row">
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
                onClick={async () => { await animateOut([r.id]); await supabase.from("clients").delete().eq("id", r.id); setRows((p) => (p ?? []).filter((x) => x.id !== r.id)); }}>×</button>
            </div>
          </div>
        ))}

        <button type="button" className="sheet-add" onClick={() => addRow()}>+ Новая строка</button>
      </div>

      </>)}

      {viewMode === "table" && <p className="hint">
        Клик — выбрать ячейку, двойной клик или Enter — редактировать, стрелки и Tab — перемещаться, Delete — очистить.
        Можно вставить диапазон из Excel или Google Таблиц через Ctrl+V / ⌘V.
      </p>}
      {viewMode === "pipeline" && <p className="hint">Перетаскивай карточки между колонками, чтобы менять этап сделки. Двойной клик открывает клиента в таблице.</p>}

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

/** Воронка: клиенты по этапам сделки, карточки перетаскиваются между колонками */
function Pipeline({ rows, onMove, onOpen }: { rows: Client[]; onMove: (id: string, outcome: string) => void; onOpen: (id: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const cols = [{ v: "", c: "#C9C9C6", label: "Без статуса" }, ...OUTCOME.map((o) => ({ ...o, label: o.v }))];
  return (
    <div className="pipeline">
      {cols.map((col) => {
        const items = rows.filter((r) => (r.outcome || "") === col.v);
        return (
          <section key={col.label} className={`pl-col ${over === col.label ? "over" : ""}`} style={{ "--c": col.c } as React.CSSProperties}
            onDragOver={(e) => { e.preventDefault(); setOver(col.label); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/client"); if (id) onMove(id, col.v); }}>
            <header><i />{col.label}<em className="mono">{items.length}</em></header>
            <div className="pl-cards">
              {items.map((r, i) => {
                const q = QUALIFY.find((x) => x.v === r.qualify);
                return (
                  <article key={r.id} className="pl-card" draggable style={{ "--i": i } as React.CSSProperties}
                    onDragStart={(e) => { e.dataTransfer.setData("text/client", r.id); e.currentTarget.classList.add("dragging"); }}
                    onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
                    onDoubleClick={() => onOpen(r.id)}>
                    <b>{r.username ? `@${r.username}` : "Без имени"}</b>
                    {r.sphere && <span className="pl-sphere">{r.sphere}</span>}
                    {r.hypothesis && <p>{r.hypothesis}</p>}
                    {q && <span className="pill" style={{ "--c": q.c } as React.CSSProperties}><i />{q.v}</span>}
                  </article>
                );
              })}
              {!items.length && <span className="pl-empty">Перетащи сюда</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FormulaBar({ address, title, value, disabled, onChange }: { address: string; title?: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className="formula-bar">
      <span className="fb-addr mono">{address || "—"}</span>
      <span className="fb-fx it">fx</span>
      <input className="fb-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        placeholder={address ? title : "Выбери ячейку"} aria-label="Содержимое ячейки" />
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
        <span key={value} className="pill" style={{ "--c": opt?.c ?? "#8A8A87" } as React.CSSProperties}><i />{value}</span>
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
