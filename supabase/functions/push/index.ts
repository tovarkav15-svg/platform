// Уведомления на телефон о новых сообщениях (Web Push).
// Зовёт база после каждого нового сообщения (триггер messages_push) с { message_id }.
// Функция сама перечитывает сообщение, поэтому подделать текст нельзя; каждое сообщение рассылается
// один раз (таблица push_sent) и только пока оно свежее — повторный вызов ничего не даст.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails("https://tovarkav15-svg.github.io/platform/", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

const FRESH_MS = 2 * 60 * 1000;
const KIND: Record<string, string> = { image: "Фото", video: "Видео", voice: "Голосовое сообщение", file: "Файл", sticker: "Стикер" };
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ ok: false });
  const { message_id } = await req.json().catch(() => ({}));
  if (typeof message_id !== "string") return ok({ ok: false });

  const { data: m } = await db.from("messages").select("id, chat_id, sender_id, text, kind, created_at, deleted_at").eq("id", message_id).maybeSingle();
  if (!m || m.deleted_at || m.kind === "system" || Date.now() - new Date(m.created_at).getTime() > FRESH_MS) return ok({ ok: false });
  // Один раз на сообщение
  const { error: dup } = await db.from("push_sent").insert({ message_id });
  if (dup) return ok({ ok: false });

  const [{ data: chat }, { data: sender }, { data: members }] = await Promise.all([
    db.from("chats").select("kind, title").eq("id", m.chat_id).maybeSingle(),
    db.from("profiles").select("display_name, username").eq("id", m.sender_id).maybeSingle(),
    db.from("chat_members").select("user_id, role").eq("chat_id", m.chat_id).neq("user_id", m.sender_id),
  ]);
  if (!chat || !members?.length) return ok();

  // В фокусе человек просил не отвлекать — ему не шлём
  const ids = members.map((x) => x.user_id);
  const { data: busy } = await db.from("profiles").select("id").in("id", ids).gt("focus_until", new Date().toISOString());
  const quiet = new Set((busy ?? []).map((x) => x.id));
  const to = ids.filter((id) => !quiet.has(id));
  if (!to.length) return ok();

  const { data: subs } = await db.from("push_subs").select("id, endpoint, p256dh, auth").in("user_id", to);
  if (!subs?.length) return ok();

  const who = sender?.display_name || (sender?.username ? `@${sender.username}` : "Сообщение");
  const what = cut((m.kind === "text" || !KIND[m.kind] ? m.text : KIND[m.kind]) || "Новое сообщение", 180);
  const dm = chat.kind === "dm" || chat.kind === "support";
  const payload = JSON.stringify({
    title: dm ? who : chat.title || "Relic",
    body: dm || chat.kind === "channel" ? what : `${who}: ${what}`,
    url: `messages/?c=${m.chat_id}`,
    tag: m.chat_id,
  });

  const gone: string[] = [];
  await Promise.all(subs.map((s) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" })
      .catch((e: { statusCode?: number }) => { if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.id); })));
  // Устройство отписалось или приложение удалено — подписку убираем
  if (gone.length) await db.from("push_subs").delete().in("id", gone);
  return ok({ sent: subs.length - gone.length });
});
