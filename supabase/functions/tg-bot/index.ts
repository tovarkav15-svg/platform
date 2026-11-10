// Бот @relicprodbot: отвечает на «Старт» и любые сообщения кнопкой «Открыть Relic».
// Telegram присылает сюда обновления (webhook) с секретным заголовком — чужие запросы отбрасываем.
const BOT = Deno.env.get("TG_BOT_TOKEN")!;
const SECRET = Deno.env.get("TG_WEBHOOK_SECRET")!;
const SITE = "https://tovarkav15-svg.github.io/platform/";

const send = (chat_id: number, text: string, path = "", button = "Открыть Relic") =>
  fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: `${SITE}${path}?tg=1` } }]] } }),
  });

Deno.serve(async (req) => {
  if (req.method !== "POST" || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) return new Response("no", { status: 401 });
  const u = await req.json().catch(() => null);
  const msg = u?.message;
  if (!msg?.chat?.id || msg.chat.type !== "private") return new Response("ok");
  const text: string = msg.text ?? "";
  const name = String(msg.from?.first_name ?? "").replace(/[<>&]/g, "");

  if (text.startsWith("/start")) {
    await send(msg.chat.id,
      `Привет${name ? `, ${name}` : ""}! 👋\n\n<b>Relic</b> — платформа для фрилансеров прямо в Telegram:\n\n• профиль, который продаёт: работы, отзывы, рейтинг\n• биржа: найди заказ или исполнителя\n• чаты с клиентами и командой\n• Workspace: задачи, клиенты, деньги\n\nВход в одно касание — без пароля. Сюда же будут приходить уведомления о новых сообщениях и откликах.`);
  } else if (text.startsWith("/help")) {
    await send(msg.chat.id, "Нажми «Открыть Relic» — откроется платформа. Вопрос или идея — напиши в поддержку внутри Relic (меню аккаунта → Поддержка).");
  } else {
    await send(msg.chat.id, "Я бот Relic: присылаю уведомления. Переписка — внутри Relic 👇");
  }
  return new Response("ok");
});
