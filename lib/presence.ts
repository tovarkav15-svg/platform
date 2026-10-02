"use client";

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { readPrefs } from "./prefs";

// Статус как в Discord: в сети / на платформе (вкладка открыта, но человек отошёл) / спит
export type PresenceState = "online" | "idle" | "sleep";
type Row = { state: "online" | "idle"; last_seen: string };

const ONLINE_WINDOW = 3 * 60 * 1000;   // дольше трёх минут без отметки — уже спит
const IDLE_AFTER = 5 * 60 * 1000;      // без движений пять минут — «на платформе», а не «в сети»

const cache = new Map<string, Row | null>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

const emit = () => { version++; listeners.forEach((l) => l()); };

async function flush() {
  timer = null;
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;
  const { data } = await supabase.from("presence").select("user_id, state, last_seen").in("user_id", ids);
  ids.forEach((id) => cache.set(id, null));
  (data ?? []).forEach((r) => cache.set(r.user_id, { state: r.state, last_seen: r.last_seen }));
  emit();
}

function want(id: string) {
  if (cache.has(id) || pending.has(id)) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, 40);
}

// Раз в минуту освежаем всех, кого уже показывали
if (typeof window !== "undefined") {
  setInterval(() => { cache.forEach((_, id) => pending.add(id)); cache.clear(); if (!timer) timer = setTimeout(flush, 0); }, 60_000);
}

export function presenceOf(row: Row | null | undefined): { state: PresenceState; label: string } {
  if (!row) return { state: "sleep", label: "Спит" };
  const ago = Date.now() - new Date(row.last_seen).getTime();
  if (ago > ONLINE_WINDOW) return { state: "sleep", label: `Спит · был в сети ${agoText(ago)}` };
  return row.state === "online" ? { state: "online", label: "В сети" } : { state: "idle", label: "На платформе" };
}

function agoText(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчера" : `${d} дн. назад`;
}

export function usePresence(userId: string | null | undefined) {
  useEffect(() => { if (userId) want(userId); }, [userId]);
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => version,
    () => 0,
  );
  return userId ? presenceOf(cache.get(userId)) : null;
}

/** Отмечаем себя: пока вкладка открыта — раз в 45 секунд */
export function startHeartbeat(userId: string) {
  let lastInput = Date.now();
  const mark = () => { lastInput = Date.now(); };
  const beat = async () => {
    if (!readPrefs().showOnline) return; // человек скрыл, что он в сети
    const state = !document.hidden && Date.now() - lastInput < IDLE_AFTER ? "online" : "idle";
    const row = { user_id: userId, state, last_seen: new Date().toISOString() } as const;
    await supabase.from("presence").upsert(row);
    cache.set(userId, { state, last_seen: row.last_seen });
    emit();
  };
  const onVisible = () => { mark(); beat(); };
  beat();
  // Активный день для AURA: одна отметка в сутки
  supabase.from("activity_days").upsert({ user_id: userId }, { onConflict: "user_id,day", ignoreDuplicates: true }).then(() => {});
  const t = setInterval(beat, 45_000);
  window.addEventListener("pointerdown", mark);
  window.addEventListener("keydown", mark);
  window.addEventListener("pointermove", mark, { passive: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(t);
    window.removeEventListener("pointerdown", mark);
    window.removeEventListener("keydown", mark);
    window.removeEventListener("pointermove", mark);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
