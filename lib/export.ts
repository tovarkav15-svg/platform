import { supabase } from "./supabase";

// Что выгружаем и по какому полю это «моё» — как «Экспорт данных» в Telegram и «Запросить информацию» в WhatsApp
const MINE: [string, string][] = [
  ["works", "user_id"], ["projects", "user_id"], ["jobs", "user_id"], ["reviews", "author_id"], ["orders", "client_id"], ["deals", "client_id"],
  ["articles", "author_id"], ["clients", "user_id"], ["notes", "user_id"], ["goals", "user_id"], ["tasks", "user_id"], ["plan_lists", "user_id"],
  ["plan_tasks", "user_id"], ["day_plans", "user_id"], ["ws_projects", "user_id"], ["invoices", "user_id"], ["fin_transactions", "user_id"],
  ["fin_payments", "user_id"], ["time_entries", "user_id"], ["earnings", "user_id"], ["wallets", "user_id"], ["user_items", "user_id"],
  ["chat_members", "user_id"], ["chats", "owner_id"],
];

/** Собирает всё своё в один JSON-файл и отдаёт на скачивание */
export async function downloadMyData(userId: string, username: string) {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), note: "Выгрузка данных аккаунта Relic" };
  const [p, msgs, friends, sec] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("messages").select("id, chat_id, text, kind, created_at, edited_at, deleted_at").eq("sender_id", userId).order("created_at").limit(10000),
    supabase.from("friendships").select("*").or(`requester.eq.${userId},addressee.eq.${userId}`),
    supabase.rpc("my_security_log"),
  ]);
  out.profile = p.data;
  out.my_messages = msgs.data ?? [];
  out.friendships = friends.data ?? [];
  out.security_log = sec.data ?? [];
  const rest = await Promise.all(MINE.map(([t, col]) => supabase.from(t).select("*").eq(col, userId).limit(5000)));
  MINE.forEach(([t], i) => { if (rest[i].data?.length) out[t] = rest[i].data; });

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `relic-${username}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
