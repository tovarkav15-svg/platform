import { supabase } from "./supabase";

export type ClientColumn = { id: string; title: string; type: "text" | "select" | "number" | "date"; options?: string[] };
export type Client = {
  id: string; user_id: string; username: string; sphere: string; qualify: string; hypothesis: string;
  outcome: string; comment: string; extra: Record<string, string>; position: number; created_at: string; updated_at: string;
};
export type WorkspaceSettings = { user_id: string; client_columns: ClientColumn[]; sync_earnings: boolean };

// Варианты для «Квалифай» и «Итог сделки»: цвет — по смыслу, но всегда с подписью
export const QUALIFY = [
  { v: "Горячий", c: "#FF6A3D" },
  { v: "Тёплый", c: "#E8B100" },
  { v: "Холодный", c: "#2F7BFF" },
  { v: "Не подходит", c: "#8A8A87" },
];
export const OUTCOME = [
  { v: "В работе", c: "#2F7BFF" },
  { v: "Сделка", c: "#1FA67A" },
  { v: "Пауза", c: "#8A8A87" },
  { v: "Отказ", c: "#E5484D" },
];

export async function loadSettings(userId: string): Promise<WorkspaceSettings> {
  const { data } = await supabase.from("workspace_settings").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data as WorkspaceSettings;
  const fresh = { user_id: userId, client_columns: [], sync_earnings: false };
  await supabase.from("workspace_settings").upsert(fresh);
  return fresh;
}

export async function saveSettings(userId: string, patch: Partial<WorkspaceSettings>) {
  await supabase.from("workspace_settings").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
}

export const rub = (n: number, sign = false) => {
  const s = Math.round(Math.abs(n)).toLocaleString("ru-RU").replace(/ /g, " ");
  return `${sign ? (n < 0 ? "−" : "+") : n < 0 ? "−" : ""}${s} ₽`;
};

/** Скачать файл из браузера */
export function download(name: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCsv(rows: string[][]) {
  return rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n");
}

/** Простой разбор CSV/TSV: кавычки, переносы строк внутри кавычек */
export function parseTable(text: string): string[][] {
  const sep = text.includes("\t") ? "\t" : text.split("\n")[0].includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
