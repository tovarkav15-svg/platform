// Уведомления на телефон о новых сообщениях (Web Push).
// Зовёт база после каждого нового сообщения (триггер messages_push) с { message_id }.
// Функция сама перечитывает сообщение, поэтому подделать текст нельзя; каждое сообщение рассылается
// один раз (таблица push_sent) и только пока оно свежее — повторный вызов ничего не даст.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails("https://tovarkav15-svg.github.io/platform/", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);

const FRESH_MS = 2 * 60 * 1000;
const BOT = Deno.env.get("TG_BOT_TOKEN") ?? "";
const SITE = "https://tovarkav15-svg.github.io/platform/";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Сообщение от бота @relicprodbot с кнопкой, которая открывает нужный экран Relic прямо в Telegram */
async function tgSend(userIds: string[], html: string, path: string, button: string) {
  if (!BOT || !userIds.length) return 0;
  const { data: links } = await db.from("tg_links").select("user_id, tg_id").in("user_id", userIds).eq("notify", true).eq("can_write", true);
  if (!links?.length) return 0;
  const url = `${SITE}${path}${path.includes("?") ? "&" : "?"}tg=1`;
  const blocked: string[] = [];
  await Promise.all(links.map(async (l) => {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: l.tg_id, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[{ text: button, web_app: { url } }]] } }),
    }).catch(() => null);
    // Человек остановил бота — больше не пишем, пока снова не откроет Relic в Telegram
    if (r && r.status === 403) blocked.push(l.user_id);
  }));
  if (blocked.length) await db.from("tg_links").update({ can_write: false }).in("user_id", blocked);
  return links.length - blocked.length;
}

/** Новый отклик на заказ — заказчику */
async function onResponse(id: string) {
  const { data: r } = await db.from("order_responses").select("id, order_id, freelancer_id, message, price, days, created_at").eq("id", id).maybeSingle();
  if (!r || Date.now() - new Date(r.created_at).getTime() > FRESH_MS) return ok({ ok: false });
  const { error: dup } = await db.from("push_sent_responses").insert({ response_id: id });
  if (dup) return ok({ ok: false });
  const [{ data: order }, { data: who }] = await Promise.all([
    db.from("orders").select("client_id, title").eq("id", r.order_id).maybeSingle(),
    db.from("profiles").select("display_name, username").eq("id", r.freelancer_id).maybeSingle(),
  ]);
  if (!order) return ok();
  const name = who?.display_name || (who?.username ? `@${who.username}` : "Специалист");
  const terms = [r.price ? `${r.price.toLocaleString("ru-RU")} ₽` : "", r.days ? `${r.days} дн.` : ""].filter(Boolean).join(" · ");
  const html = `📩 <b>Новый отклик на заказ</b>\n«${esc(cut(order.title, 80))}»\n\n<b>${esc(name)}</b>${terms ? ` — ${esc(terms)}` : ""}\n${esc(cut(r.message, 300))}`;
  const sent = await tgSend([order.client_id], html, "jobs/?tab=my-orders", "Открыть отклики");
  return ok({ tg: sent });
}
const KIND: Record<string, string> = { image: "Фото", video: "Видео", voice: "Голосовое сообщение", file: "Файл", sticker: "Стикер" };
const ok = (b: unknown = { ok: true }) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ ok: false });
  const { message_id, response_id } = await req.json().catch(() => ({}));
  if (typeof response_id === "string") return onResponse(response_id);
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

  const who = sender?.display_name || (sender?.username ? `@${sender.username}` : "Сообщение");
  const what = cut((m.kind === "text" || !KIND[m.kind] ? m.text : KIND[m.kind]) || "Новое сообщение", 180);
  const dm = chat.kind === "dm" || chat.kind === "support";

  // В Telegram — тем, кто привязал его к аккаунту (в больших каналах не шлём, чтобы не спамить)
  const tgTo = chat.kind === "channel" ? [] : to;
  const head = dm ? `💬 <b>${esc(who)}</b>` : `💬 <b>${esc(chat.title || "Relic")}</b>\n${esc(who)}:`;
  const tgSent = await tgSend(tgTo, `${head}\n${esc(what)}`, `messages/?c=${m.chat_id}`, "Ответить");

  const { data: subs } = await db.from("push_subs").select("id, endpoint, p256dh, auth").in("user_id", to);
  if (!subs?.length) return ok({ tg: tgSent });
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
