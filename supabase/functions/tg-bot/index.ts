// Бот @relicprodbot: отвечает на «Старт» и любые сообщения кнопкой «Открыть Relic».
// Telegram присылает сюда обновления (webhook) с секретным заголовком — чужие запросы отбрасываем.
const BOT = Deno.env.get("TG_BOT_TOKEN")!;
const SECRET = Deno.env.get("TG_WEBHOOK_SECRET")!;
const SITE = "https://tovarkav15-svg.github.io/platform/";

const api = (method: string, body: unknown) =>
  fetch(`https://api.telegram.org/bot${BOT}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const openBtn = (text = "Платформа") => ({ text, web_app: { url: `${SITE}?tg=1` } });
const send = (chat_id: number, text: string) => api("sendMessage", { chat_id, text, parse_mode: "HTML", reply_markup: { inline_keyboard: [[openBtn("Открыть Relic")]] } });

// Приветствие на «Старт»: баннер Relic и три кнопки. «Моя подписка» и «Наш канал» — пока без ссылок
const BANNER = `${SITE}brand/relic-bot-banner.png?v=1`;
const MENU = { inline_keyboard: [[openBtn()], [{ text: "Моя подписка", callback_data: "sub" }], [{ text: "Наш канал", callback_data: "channel" }]] };

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) return new Response("no", { status: 401 });
  const u = await req.json().catch(() => null);
  // Нажали «Моя подписка» или «Наш канал» — пока только подсказка «скоро»
  if (u?.callback_query?.id) {
    const what = u.callback_query.data === "sub" ? "Подписка" : "Наш канал";
    await api("answerCallbackQuery", { callback_query_id: u.callback_query.id, text: `${what} — скоро появится`, show_alert: false });
    return new Response("ok");
  }
  const msg = u?.message;
  if (!msg?.chat?.id || msg.chat.type !== "private") return new Response("ok");
  const text: string = msg.text ?? "";

  if (text.startsWith("/start")) {
    const r = await api("sendPhoto", { chat_id: msg.chat.id, photo: BANNER, caption: "Привет, ты попал в Relic", reply_markup: MENU });
    // Картинка не загрузилась — шлём то же без неё
    if (!r.ok) await api("sendMessage", { chat_id: msg.chat.id, text: "Привет, ты попал в Relic", reply_markup: MENU });
  } else if (text.startsWith("/help")) {
    await send(msg.chat.id, "Нажми «Открыть Relic» — откроется платформа. Вопрос или идея — напиши в поддержку внутри Relic (меню аккаунта → Поддержка).");
  } else {
    await send(msg.chat.id, "Я бот Relic: присылаю уведомления. Переписка — внутри Relic 👇");
  }
  return new Response("ok");
});
