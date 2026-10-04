import { useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "./supabase";

export type DealStatus = "terms" | "active" | "review" | "done" | "cancelled";
export type Deal = {
  id: string; order_id: string; client_id: string; executor_id: string; price: number; deadline: string | null; terms: string;
  status: DealStatus; client_ok: boolean; executor_ok: boolean; created_at: string; updated_at: string; done_at: string | null;
  order?: { id: string; title: string; niche: string };
  client?: ProfileCard; executor?: ProfileCard;
};
export type DealStep = { id: string; deal_id: string; position: number; title: string; amount: number; done: boolean };
export type DealEvent = { id: string; deal_id: string; actor: string | null; kind: string; note: string; created_at: string };

export const DEAL_SELECT = `*, order:orders(id, title, niche), client:profiles!deals_client_id_fkey(${PROFILE_CARD}), executor:profiles!deals_executor_id_fkey(${PROFILE_CARD})`;
export const dealHref = (id: string) => `/deal/?id=${encodeURIComponent(id)}`;

export const DEAL_STAGES: { id: DealStatus; label: string }[] = [
  { id: "terms", label: "Условия" },
  { id: "active", label: "В работе" },
  { id: "review", label: "Проверка" },
  { id: "done", label: "Готово" },
];
export const DEAL_STATUS: Record<DealStatus, string> = {
  terms: "Согласование", active: "В работе", review: "На проверке", done: "Закрыта", cancelled: "Отменена",
};

/** Чего сделка ждёт именно от меня — для подсветки в списках */
export function dealTodo(d: Deal, me: string): string {
  const client = me === d.client_id;
  if (d.status === "terms") return (client ? d.client_ok : d.executor_ok) ? "" : "Подтверди условия";
  if (d.status === "active") return client ? "" : "Сдай работу";
  if (d.status === "review") return client ? "Проверь работу" : "";
  return "";
}

export const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

/** Сколько сделок человек закрыл исполнителем — одним запросом на список */
export function useDealsDone(ids: string[]) {
  const [map, setMap] = useState<Record<string, number>>({});
  const key = Array.from(new Set(ids)).sort().join(",");
  useEffect(() => {
    if (!key) return;
    supabase.rpc("deals_done_of", { p_users: key.split(",") }).then(({ data }) => {
      const m: Record<string, number> = {};
      for (const r of (data as { user_id: string; n: number }[]) ?? []) m[r.user_id] = r.n;
      setMap(m);
    });
  }, [key]);
  return map;
}

export const dealsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "сделка" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "сделки" : "сделок");
