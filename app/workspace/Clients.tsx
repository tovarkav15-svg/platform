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
const BASE_MAP = new Map(BASE.map((c) => [c.key, c]));
const TYPE_NAME: Record<ClientColumn["type"], string> = { text: "Текст", number: "Число", date: "Дата", select: "Список" };
const newColId = () => `c_${crypto.randomUUID().slice(0, 8)}`;

// Старые настройки хранили только свои колонки: базовые встают перед ними в исходном порядке
function normalizeLayout(saved: ClientColumn[] | null | undefined): ClientColumn[] {
  const list = (saved ?? []).filter((c) => c?.id && (!c.base || BASE_MAP.has(c.id)));
  const have = new Set(list.filter((c) => c.base).map((c) => c.id));
  const missing = BASE.filter((b) => !have.has(b.key)).map((b): ClientColumn => ({ id: b.key, title: b.title, type: "text", base: true }));
  return [...missing, ...list];
}

function toCol(c: ClientColumn): Col {
  const b = c.base ? BASE_MAP.get(c.id) : undefined;
  if (b) return { ...b, title: c.title.trim() || b.title };
  return { key: c.id, title: c.title, type: c.type, custom: true, width: c.type === "text" ? 180 : 150, options: c.options?.map((v) => ({ v })) };
}

/** Свободное название вида «Колонка 3» */
function freeTitle(layout: ClientColumn[], base = "Колонка") {
  const used = new Set(layout.map((c) => c.title.trim().toLowerCase()));
  for (let n = layout.filter((c) => !c.base).length + 1; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

const getVal = (r: Client, key: string) => (FIXED.has(key) ? String((r as unknown as Record<string, string>)[key] ?? "") : r.extra?.[key] ?? "");

export function Clients({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Client[] | null>(null);
  const [layout, setLayout] = useState<ClientColumn[]>(() => normalizeLayout([]));
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<{ qualify?: string; outcome?: string }>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [colEditor, setColEditor] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number; rename?: boolean } | null>(null);
  const [drop, setDrop] = useState<{ key: string; side: "left" | "right" } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
      setLayout(normalizeLayout(s.client_columns));
      setRows((data as Client[]) ?? []);
      if (sp.get("new") === "1" && !autoAdded.current) { autoAdded.current = true; setTimeout(() => addRowRef.current?.(), 0); }
    })();
    try { setWidths(JSON.parse(localStorage.getItem("clients:widths") ?? "{}")); } catch {}
  }, [userId]);

  const columns: Col[] = useMemo(
    () => layout.filter((c) => !c.hidden).map(toCol).map((c) => ({ ...c, width: widths[c.key] ?? c.width })),
    [layout, widths],
  );

  const flash = (text: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2200);
  };

  // Колонки сохраняются в настройках пользователя сразу после любого изменения
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const saveLayout = useCallback((next: ClientColumn[]) => {
    layoutRef.current = next;
    setLayout(next);
    saveSettings(userId, { client_columns: next }).catch(() => flash("Колонки не сохранились. Проверь интернет."));
  }, [userId]);
  const patchColumn = (id: string, patch: Partial<ClientColumn>) => saveLayout(layoutRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  // Выделение не должно указывать на колонку, которой больше нет
  useEffect(() => { setSel((s) => (s && s.c >= columns.length ? null : s)); }, [columns.length]);

  /** Открыть меню колонки под её заголовком */
  function openMenu(key: string, cell: HTMLElement, rename = false) {
    const box = wrap.current?.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    if (!box) return;
    const w = 288;
    setMenu({ key, rename, x: Math.max(0, Math.min(r.left - box.left, box.width - w)), y: r.bottom - box.top + 6 });
  }

  /** Новая колонка рядом с другой (или в конце) — сразу открывается меню, чтобы назвать её */
  function insertColumn(nearKey?: string, side: "left" | "right" = "right") {
    const list = layoutRef.current;
    const col: ClientColumn = { id: newColId(), title: freeTitle(list), type: "text" };
    const at = nearKey ? list.findIndex((c) => c.id === nearKey) + (side === "right" ? 1 : 0) : list.length;
    saveLayout([...list.slice(0, at), col, ...list.slice(at)]);
    setMenu(null);
    // Ждём, пока заголовок появится в таблице
    setTimeout(() => {
      const cell = grid.current?.querySelector<HTMLElement>(`[data-col="${col.id}"]`);
      if (!cell) return;
      cell.scrollIntoView({ block: "nearest", inline: "nearest" });
      openMenu(col.id, cell, true);
    }, 30);
  }

  /** Своя колонка с заданным названием и типом — в конец таблицы (из карточки клиента) */
  function appendColumn(title: string, type: ClientColumn["type"], options?: string[]) {
    const list = layoutRef.current;
    const t = title.trim().slice(0, 40) || freeTitle(list);
    saveLayout([...list, { id: newColId(), title: t, type, options: type === "select" ? options?.slice(0, 20) : undefined }]);
    flash(`Поле «${t}» добавлено и в таблицу`);
  }

  async function deleteRow(id: string) {
    await animateOut([id]);
    await supabase.from("clients").delete().eq("id", id);
    setRows((p) => (p ?? []).filter((x) => x.id !== id));
  }

  function deleteColumn(id: string) {
    const before = layoutRef.current;
    const col = before.find((c) => c.id === id);
    if (!col || col.base) return;
    saveLayout(before.filter((c) => c.id !== id));
    setMenu(null);
    setSort((s) => (s?.key === id ? null : s));
    // Значения остаются в строках, поэтому колонку можно вернуть вместе с данными
    flash(`Колонка «${col.title}» удалена`, () => saveLayout(before));
  }

  function moveColumn(from: string, to: string, side: "left" | "right") {
    if (from === to) return;
    const list = layoutRef.current.filter((c) => c.id !== from);
    const moved = layoutRef.current.find((c) => c.id === from);
    if (!moved) return;
    const at = list.findIndex((c) => c.id === to) + (side === "right" ? 1 : 0);
    saveLayout([...list.slice(0, at), moved, ...list.slice(at)]);
    setSel(null);
  }

  /** Добавить недостающие колонки (для вставки и импорта), вернуть ключи видимых колонок */
  function ensureColumns(count: number, titles: string[] = []): string[] {
    let list = layoutRef.current;
    const visible = list.filter((c) => !c.hidden).length;
    if (count > visible) {
      const add: ClientColumn[] = [];
      for (let i = visible; i < count; i++) {
        const t = titles[i - visible]?.trim().slice(0, 40);
        const tmp = [...list, ...add];
        add.push({ id: newColId(), title: t && !tmp.some((c) => c.title.toLowerCase() === t.toLowerCase()) ? t : freeTitle(tmp), type: "text" });
      }
      list = [...list, ...add];
      saveLayout(list);
    }
    return list.filter((c) => !c.hidden).map((c) => c.id);
  }

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
    const width = Math.max(...block.map((r) => r.length));
    const keys = ensureColumns(sel.c + width);
    const added = keys.length - columns.length;
    block.forEach((cells, i) => {
      const row = list[sel.r + i];
      if (!row) return;
      cells.forEach((v, j) => { const key = keys[sel.c + j]; if (key) setCell(row.id, key, v.trim()); });
    });
    flash(`Вставлено строк: ${block.length}${added > 0 ? `, новых колонок: ${added}` : ""}`);
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
    const rawHead = table[0].map((h) => h.trim());
    const head = rawHead.map((h) => h.toLowerCase());
    // Ищем и среди скрытых колонок, чтобы не плодить дубли
    const all = layoutRef.current.map(toCol);
    const known = new Set<number>();
    const map = all.map((c) => {
      const i = head.findIndex((h, n) => !known.has(n) && (h === c.title.toLowerCase() || h === c.key || h === BASE_MAP.get(c.key)?.title.toLowerCase()));
      if (i >= 0) known.add(i);
      return { c, i };
    });
    // Колонки из файла, которых нет в таблице, добавляются как новые
    const extraCols: ClientColumn[] = [];
    head.forEach((h, i) => {
      if (known.has(i) || !h) return;
      const id = newColId();
      extraCols.push({ id, title: rawHead[i].slice(0, 40), type: "text" });
      map.push({ c: { key: id, title: rawHead[i], type: "text", width: 180, custom: true }, i });
    });
    if (extraCols.length) saveLayout([...layoutRef.current, ...extraCols]);
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
    flash(`Загружено строк: ${data?.length ?? 0}${extraCols.length ? `, новых колонок: ${extraCols.length}` : ""}`);
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
  const template = `44px ${columns.map((c) => `${c.width}px`).join(" ")} 72px`;
  const numCols = columns.filter((c) => c.type === "number");
  const menuEntry = menu ? layout.find((c) => c.id === menu.key) : undefined;

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
          {viewMode === "table" && <button type="button" className="btn ghost sm" onClick={() => insertColumn()}>+ Колонка</button>}
          <label className="btn ghost sm">Импорт CSV<input type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} /></label>
          <button type="button" className="btn ghost sm" onClick={exportCsv}>Экспорт</button>
          <button type="button" className="btn sm" onClick={() => addRow()}>+ Клиент</button>
        </div>
      </div>

      {viewMode === "pipeline" ? (
        <Pipeline rows={view} onMove={(id, outcome) => setCell(id, "outcome", outcome)} onOpen={(id) => setCardId(id)} />
      ) : (<div className="sheet-wrap" ref={wrap}>
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
            <div key={c.key} data-col={c.key} role="columnheader"
              className={`sheet-cell th ${menu?.key === c.key ? "menu-on" : ""} ${drop?.key === c.key ? `drop-${drop.side}` : ""}`}
              aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              onContextMenu={(e) => { e.preventDefault(); openMenu(c.key, e.currentTarget); }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("text/col")) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const side = e.clientX < r.left + r.width / 2 ? "left" : "right";
                if (drop?.key !== c.key || drop.side !== side) setDrop({ key: c.key, side });
              }}
              onDragLeave={() => setDrop((d) => (d?.key === c.key ? null : d))}
              onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/col"); if (from && drop) moveColumn(from, c.key, drop.side); setDrop(null); }}
            >
              <button type="button" draggable title="Нажми, чтобы настроить. Перетащи, чтобы переставить"
                onClick={(e) => { const cell = e.currentTarget.parentElement!; menu?.key === c.key ? setMenu(null) : openMenu(c.key, cell); }}
                onDoubleClick={(e) => openMenu(c.key, e.currentTarget.parentElement!, true)}
                onDragStart={(e) => { e.dataTransfer.setData("text/col", c.key); e.dataTransfer.effectAllowed = "move"; setMenu(null); }}
                onDragEnd={() => setDrop(null)}>
                <em className="col-letter">{letter(ci)}</em><span className="th-title">{c.title}</span>
                <span className="sort">{sort?.key === c.key ? (sort.dir === 1 ? "↑" : "↓") : <i className="th-caret" aria-hidden="true">▾</i>}</span>
              </button>
              <span className="resizer" onPointerDown={(e) => { e.preventDefault(); startResize(c.key, e.clientX, c.width); }} />
            </div>
          ))}
          <div className="sheet-cell th add-col">
            <button type="button" onClick={() => insertColumn()} aria-label="Добавить колонку" title="Добавить колонку">+</button>
          </div>
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
                    <span className={`cell-text ${c.type === "user" && v ? "user" : ""}`}><CellText value={v} user={c.type === "user"} /></span>
                  )}
                </div>
              );
            })}
            <div className="sheet-cell end">
              <button type="button" className="icon-btn sm" aria-label="Открыть карточку клиента" title="Карточка клиента" onClick={() => setCardId(r.id)}>⤢</button>
              <button type="button" className="icon-btn sm" aria-label="Удалить строку" onClick={() => deleteRow(r.id)}>×</button>
            </div>
          </div>
        ))}

        {numCols.length > 0 && view.length > 0 && (
          <div className="sheet-row foot" style={{ gridTemplateColumns: template }} role="row">
            <div className="sheet-cell idx"><span className="rownum">Σ</span></div>
            {columns.map((c) => {
              if (c.type !== "number") return <div key={c.key} className="sheet-cell" />;
              const sum = view.reduce((a, r) => a + (parseFloat(getVal(r, c.key).replace(",", ".")) || 0), 0);
              return <div key={c.key} className="sheet-cell sum" title="Сумма по видимым строкам">{sum.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</div>;
            })}
            <div className="sheet-cell end" />
          </div>
        )}

        <button type="button" className="sheet-add" onClick={() => addRow()}>+ Новая строка</button>
      </div>

      {menu && menuEntry && (
        <ColumnMenu
          key={menu.key}
          entry={menuEntry}
          col={toCol(menuEntry)}
          x={menu.x} y={menu.y} focusTitle={menu.rename}
          sort={sort?.key === menu.key ? sort.dir : 0}
          onClose={() => { setMenu(null); grid.current?.focus(); }}
          onPatch={(patch) => patchColumn(menu.key, patch)}
          onSort={(dir) => { setSort(dir ? { key: menu.key, dir } : null); setMenu(null); }}
          onInsert={(side) => insertColumn(menu.key, side)}
          onHide={() => { patchColumn(menu.key, { hidden: true }); setMenu(null); flash("Колонка скрыта. Вернуть можно в «Колонки»"); }}
          onDelete={() => deleteColumn(menu.key)}
        />
      )}
      </div>)}

      {viewMode === "table" && <p className="hint">
        Клик — выбрать ячейку, двойной клик или Enter — редактировать, стрелки и Tab — перемещаться, Delete — очистить.
        Клик по заголовку — переименовать, сменить тип, сортировать, вставить или удалить колонку. Заголовок можно перетащить, «+» справа добавляет колонку. Кнопка ⤢ в конце строки открывает карточку клиента со всеми полями.
        Можно вставить диапазон из Excel или Google Таблиц через Ctrl+V / ⌘V: если он шире таблицы, недостающие колонки появятся сами.
      </p>}
      {viewMode === "pipeline" && <p className="hint">Перетаскивай карточки между колонками, чтобы менять этап сделки. Двойной клик открывает карточку клиента.</p>}

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.undo && <button type="button" className="toast-undo" onClick={() => { toast.undo?.(); setToast(null); }}>Вернуть</button>}
        </div>
      )}
      {cardId && (() => {
        const i = view.findIndex((x) => x.id === cardId);
        const row = rows.find((x) => x.id === cardId);
        if (!row) return null;
        return (
          <ClientCard
            row={row} layout={layout}
            pos={i >= 0 ? `${i + 1} из ${view.length}` : ""}
            onPrev={i > 0 ? () => setCardId(view[i - 1].id) : undefined}
            onNext={i >= 0 && i < view.length - 1 ? () => setCardId(view[i + 1].id) : undefined}
            onChange={(key, v) => setCell(row.id, key, v)}
            onAddField={appendColumn}
            onDelete={async () => { setCardId(null); await deleteRow(row.id); flash("Клиент удалён"); }}
            onClose={() => setCardId(null)}
          />
        );
      })()}
      {colEditor && (
        <ColumnEditor
          columns={layout}
          onClose={() => setColEditor(false)}
          onSave={(next) => { saveLayout(next); setColEditor(false); flash("Колонки сохранены"); }}
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
    // У полей «число» и «дата» нет выделения текста: setSelectionRange там бросает ошибку
    if (el.type === "number" || el.type === "date") return;
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

/** Карточка клиента сбоку: все поля (и скрытые в таблице), свои поля добавляются прямо здесь */
function ClientCard({ row, layout, pos, onPrev, onNext, onChange, onAddField, onDelete, onClose }: {
  row: Client; layout: ClientColumn[]; pos: string; onPrev?: () => void; onNext?: () => void;
  onChange: (key: string, v: string) => void; onAddField: (title: string, type: ClientColumn["type"], options?: string[]) => void;
  onDelete: () => void; onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ClientColumn["type"]>("text");
  const [opts, setOpts] = useState("");
  const [confirm, setConfirm] = useState(false);
  const fields = layout.map((c) => ({ entry: c, col: toCol(c) }));
  const name = row.username ? `@${row.username}` : "Новый клиент";

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Стрелки листают клиентов, когда курсор не в поле ввода
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (e.key === "ArrowUp" && onPrev) onPrev();
      if (e.key === "ArrowDown" && onNext) onNext();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, onPrev, onNext]);
  useEffect(() => setConfirm(false), [row.id]);

  return (
    <div className="card-drawer-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="card-drawer" role="dialog" aria-label={`Карточка: ${name}`}>
        <header className="cd-head">
          <div className="cd-nav">
            <button type="button" className="icon-btn sm" aria-label="Предыдущий клиент" disabled={!onPrev} onClick={onPrev}>↑</button>
            <button type="button" className="icon-btn sm" aria-label="Следующий клиент" disabled={!onNext} onClick={onNext}>↓</button>
            <span className="label">{pos}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>×</button>
        </header>
        <h2 className="h-md caps cd-title">{name}</h2>

        <div className="cd-fields" key={row.id}>
          {fields.map(({ entry, col }) => {
            const v = getVal(row, col.key);
            const id = `cd-${col.key}`;
            return (
              <label key={col.key} className="cd-field" htmlFor={id}>
                <span className="label">{col.title}{entry.hidden && <em className="cd-hidden"> · скрыта в таблице</em>}</span>
                {col.type === "select" ? (
                  <select id={id} className="mini-select" value={v} onChange={(e) => onChange(col.key, e.target.value)}>
                    <option value="">Не выбрано</option>
                    {(col.options ?? []).map((o) => <option key={o.v} value={o.v}>{o.v}</option>)}
                  </select>
                ) : col.long ? (
                  <textarea id={id} className="cd-input" rows={3} value={v} onChange={(e) => onChange(col.key, e.target.value)} />
                ) : (
                  <input id={id} className="cd-input" type={col.type === "number" || col.type === "date" ? col.type : "text"}
                    value={v} placeholder={col.type === "user" ? "ник или ссылка" : ""} onChange={(e) => onChange(col.key, e.target.value)} />
                )}
              </label>
            );
          })}
        </div>

        {adding ? (
          <form className="cd-add" onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onAddField(title, type, opts.split(",").map((s) => s.trim()).filter(Boolean));
            setTitle(""); setOpts(""); setType("text"); setAdding(false);
          }}>
            <span className="label">Новое поле</span>
            <div className="input"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Бюджет, Источник, Дата созвона" maxLength={40} aria-label="Название поля" /></div>
            <div className="cm-types" role="radiogroup" aria-label="Тип поля">
              {(Object.keys(TYPE_NAME) as ClientColumn["type"][]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{TYPE_NAME[t]}</button>
              ))}
            </div>
            {type === "select" && <div className="input"><input value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Варианты через запятую" aria-label="Варианты" /></div>}
            <p className="hint">Поле появится у всех клиентов и в таблице как новая колонка.</p>
            <div className="cd-actions">
              <button type="submit" className="btn sm" disabled={!title.trim()}>Добавить поле</button>
              <button type="button" className="btn ghost sm" onClick={() => setAdding(false)}>Отмена</button>
            </div>
          </form>
        ) : (
          <button type="button" className="sheet-add cd-add-btn" onClick={() => setAdding(true)}>+ Добавить поле</button>
        )}

        <footer className="cd-foot">
          {confirm ? (
            <div className="cm-confirm"><span>Удалить клиента {name}?</span>
              <button type="button" className="btn danger sm" onClick={onDelete}>Удалить</button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Отмена</button>
            </div>
          ) : <button type="button" className="btn ghost sm danger-text" onClick={() => setConfirm(true)}>Удалить клиента</button>}
        </footer>
      </aside>
    </div>
  );
}

/** Меню колонки: название, тип, варианты списка, сортировка, вставка, скрытие, удаление */
function ColumnMenu({ entry, col, x, y, focusTitle, sort, onClose, onPatch, onSort, onInsert, onHide, onDelete }: {
  entry: ClientColumn; col: Col; x: number; y: number; focusTitle?: boolean; sort: 0 | 1 | -1;
  onClose: () => void; onPatch: (p: Partial<ClientColumn>) => void; onSort: (dir: 1 | -1 | null) => void;
  onInsert: (side: "left" | "right") => void; onHide: () => void; onDelete: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(col.title);
  const [opt, setOpt] = useState("");
  const [confirm, setConfirm] = useState(false);
  const isCustom = !entry.base;
  const options = entry.options ?? [];

  useEffect(() => {
    if (focusTitle) { titleRef.current?.focus(); titleRef.current?.select(); }
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Клик, который открыл меню, ещё не закончился — слушаем со следующего тика
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, []);

  const saveTitle = () => {
    const t = title.trim().slice(0, 40);
    if (t && t !== col.title) onPatch({ title: t });
    else setTitle(col.title);
  };
  const addOpt = () => {
    const v = opt.trim().slice(0, 40);
    if (v && !options.includes(v) && options.length < 20) onPatch({ options: [...options, v] });
    setOpt("");
  };

  return (
    <div className="col-menu card" ref={box} role="dialog" aria-label={`Колонка «${col.title}»`} style={{ left: x, top: y }}>
      <div className="input">
        <input ref={titleRef} value={title} maxLength={40} aria-label="Название колонки"
          onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); onClose(); } }} />
      </div>

      {isCustom ? (
        <div className="cm-types" role="radiogroup" aria-label="Тип колонки">
          {(Object.keys(TYPE_NAME) as ClientColumn["type"][]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={entry.type === t} className={entry.type === t ? "on" : ""}
              onClick={() => onPatch({ type: t, options: t === "select" ? options : entry.options })}>{TYPE_NAME[t]}</button>
          ))}
        </div>
      ) : (
        <p className="cm-note">Базовая колонка: её можно переименовать, переставить или скрыть, но не удалить.</p>
      )}

      {isCustom && entry.type === "select" && (
        <div className="cm-opts">
          <span className="label">Варианты</span>
          <div className="cm-chips">
            {options.map((o) => (
              <span key={o} className="cm-chip">{o}
                <button type="button" aria-label={`Убрать вариант ${o}`} onClick={() => onPatch({ options: options.filter((x) => x !== o) })}>×</button>
              </span>
            ))}
            {!options.length && <span className="hint">Пока пусто. Добавь первый вариант.</span>}
          </div>
          <form className="cm-add" onSubmit={(e) => { e.preventDefault(); addOpt(); }}>
            <div className="input"><input value={opt} onChange={(e) => setOpt(e.target.value)} placeholder="Новый вариант" maxLength={40} aria-label="Новый вариант" /></div>
            <button type="submit" className="btn ghost sm" disabled={!opt.trim()}>Добавить</button>
          </form>
        </div>
      )}

      <div className="cm-list">
        <button type="button" className={sort === 1 ? "on" : ""} onClick={() => onSort(sort === 1 ? null : 1)}>↑ Сортировать {col.type === "number" ? "по возрастанию" : "А → Я"}</button>
        <button type="button" className={sort === -1 ? "on" : ""} onClick={() => onSort(sort === -1 ? null : -1)}>↓ Сортировать {col.type === "number" ? "по убыванию" : "Я → А"}</button>
        <hr />
        <button type="button" onClick={() => onInsert("left")}>← Вставить колонку слева</button>
        <button type="button" onClick={() => onInsert("right")}>→ Вставить колонку справа</button>
        <hr />
        <button type="button" onClick={onHide}>Скрыть колонку</button>
        {isCustom && (confirm ? (
          <div className="cm-confirm">
            <span>Удалить «{col.title}»?</span>
            <button type="button" className="btn danger sm" onClick={onDelete}>Удалить</button>
            <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        ) : (
          <button type="button" className="danger-text" onClick={() => setConfirm(true)}>Удалить колонку</button>
        ))}
      </div>
    </div>
  );
}

/** Все колонки списком: показать или скрыть, переименовать, переставить, удалить свои, добавить новую */
function ColumnEditor({ columns, onClose, onSave }: { columns: ClientColumn[]; onClose: () => void; onSave: (c: ClientColumn[]) => void }) {
  const [list, setList] = useState<ClientColumn[]>(columns);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ClientColumn["type"]>("text");
  const [opts, setOpts] = useState("");
  const patch = (i: number, p: Partial<ClientColumn>) => setList(list.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const visible = list.filter((c) => !c.hidden).length;
  return (
    <div className="sheet-modal" role="dialog" aria-label="Колонки" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-body card">
        <header className="modal-head"><h2 className="h-md caps">Колонки <span className="it">таблицы</span></h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button></header>
        <p className="lead small">Сними галочку, чтобы скрыть колонку. Данные в скрытой колонке сохраняются. Названия можно менять прямо здесь.</p>
        <ul className="section-order col-list">
          {list.map((c, i) => (
            <li key={c.id} className={c.hidden ? "" : "on"}>
              <input type="checkbox" checked={!c.hidden} aria-label={`Показывать «${c.title}»`}
                disabled={!c.hidden && visible <= 1} onChange={() => patch(i, { hidden: !c.hidden })} />
              <input className="col-title" value={c.title} maxLength={40} aria-label="Название колонки"
                onChange={(e) => patch(i, { title: e.target.value })}
                onBlur={(e) => { if (!e.target.value.trim()) patch(i, { title: c.base ? BASE_MAP.get(c.id)?.title ?? "Колонка" : "Колонка" }); }} />
              <span className="hint">{c.base ? "базовая" : `${TYPE_NAME[c.type].toLowerCase()}${c.options?.length ? `: ${c.options.join(", ")}` : ""}`}</span>
              <span className="order-btns">
                <button type="button" className="icon-btn sm" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="icon-btn sm" aria-label="Ниже" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                {!c.base && <button type="button" className="icon-btn sm" aria-label="Удалить колонку" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button>}
              </span>
            </li>
          ))}
        </ul>
        <form className="col-add" onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setList([...list, { id: newColId(), title: title.trim().slice(0, 40), type, options: type === "select" ? opts.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) : undefined }]);
          setTitle(""); setOpts("");
        }}>
          <div className="input"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название новой колонки" maxLength={40} aria-label="Название колонки" /></div>
          <div className="input">
            <select value={type} onChange={(e) => setType(e.target.value as ClientColumn["type"])} aria-label="Тип колонки">
              <option value="text">Текст</option><option value="number">Число</option><option value="date">Дата</option><option value="select">Список</option>
            </select>
          </div>
          {type === "select" && <div className="input"><input value={opts} onChange={(e) => setOpts(e.target.value)} placeholder="Варианты через запятую" aria-label="Варианты" /></div>}
          <button type="submit" className="btn ghost sm" disabled={!title.trim()}>Добавить</button>
        </form>
        <div className="editor-actions"><button type="button" className="btn" onClick={() => onSave(list.map((c) => ({ ...c, title: c.title.trim() || "Колонка" })))}>Сохранить</button></div>
      </div>
    </div>
  );
}

// Ссылки в ячейках сразу кликабельны: адреса сайтов открываются в новой вкладке, @ник — в Telegram.
// Клик по ссылке не выбирает ячейку и не начинает редактирование
const CELL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:ru|com|net|org|io|me|app|dev|online|site|store|pro|info|рф|su|ai|gg|tv|co|xyz|tech|shop|by|kz|ua)\b(?:\/[^\s<>"']*)?|@[a-z][a-z0-9_]{3,31})/gi;
const CELL_TRAIL = /[.,!?;:)»"'\]]+$/;
const hrefOf = (t: string) => (t.startsWith("@") ? `https://t.me/${t.slice(1)}` : /^https?:\/\//i.test(t) ? t : `https://${t}`);
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function CellLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a className="cell-link" href={href} target="_blank" rel="noopener noreferrer nofollow" onMouseDown={stop} onDoubleClick={stop}>{children}</a>;
}

function CellText({ value, user }: { value: string; user: boolean }) {
  if (!value) return null;
  if (user) {
    const v = value.trim().replace(/^@+/, "");
    // В колонку ника иногда вставляют целую ссылку — показываем её как ссылку, без «@»
    if (/^(https?:\/\/|www\.|t\.me\/)/i.test(v)) return <CellLink href={hrefOf(v)}>{v.replace(/^https?:\/\//i, "")}</CellLink>;
    if (/^[a-z][a-z0-9_]{3,31}$/i.test(v)) return <CellLink href={`https://t.me/${v}`}>@{v}</CellLink>;
    return <>@{v}</>;
  }
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of value.matchAll(CELL_RE)) {
    const start = m.index ?? 0;
    let token = m[0];
    const tail = token.match(CELL_TRAIL)?.[0] ?? "";
    if (tail) token = token.slice(0, -tail.length);
    // e-mail (name@mail.ru) — не ник
    if (token.startsWith("@") && start > 0 && /[a-z0-9._-]/i.test(value[start - 1])) continue;
    if (start > last) out.push(value.slice(last, start));
    out.push(<CellLink key={start} href={hrefOf(token)}>{token}</CellLink>);
    if (tail) out.push(tail);
    last = start + m[0].length;
  }
  if (last < value.length) out.push(value.slice(last));
  return <>{out}</>;
}
