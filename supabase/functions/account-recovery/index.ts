// Восстановление доступа модератором: письмо для нового пароля на почту аккаунта
// или перенос аккаунта на новую почту человека (если старую угнали или потеряли) + письмо на неё.
// Вызывать может только модератор (owner/founder); каждое действие пишется в историю аккаунта и журнал модерации.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const REDIRECT = "https://tovarkav15-svg.github.io/platform/reset/";
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(token);
  const modId = who.user?.id;
  if (!modId) return json({ error: "Нужно войти" }, 401);
  const { data: mod } = await db.from("profiles").select("role").eq("id", modId).maybeSingle();
  if (!mod || !["owner", "founder"].includes(mod.role)) return json({ error: "Только для модераторов" }, 403);

  let body: { action?: string; user_id?: string; email?: string; note?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const userId = String(body.user_id ?? "");
  const note = String(body.note ?? "").slice(0, 300);
  const { data: target } = await db.auth.admin.getUserById(userId);
  if (!target.user) return json({ error: "Аккаунт не найден" }, 404);
  const { data: tp } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (tp && ["owner", "founder"].includes(tp.role) && userId !== modId) return json({ error: "Нельзя для другого модератора" }, 403);

  const log = async (what: string, action: string) => {
    await db.from("account_history").insert({ user_id: userId, kind: "recovery", moderator: modId, note: [what, note].filter(Boolean).join(" · ") });
    await db.from("mod_log").insert({ moderator: modId, action, target_user: userId, note });
  };

  if (body.action === "reset") {
    const email = target.user.email;
    if (!email) return json({ error: "У аккаунта нет почты" }, 400);
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
    if (error) return json({ error: /rate|seconds|limit/i.test(error.message) ? "Письмо уже отправляли, подожди минуту" : error.message }, 400);
    await log("отправлена ссылка для нового пароля на почту аккаунта", "recovery_reset");
    return json({ ok: true });
  }

  if (body.action === "set_email") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 320) return json({ error: "Неверная почта" }, 400);
    const { data: taken } = await db.from("private_info").select("id").ilike("email", email).neq("id", userId).maybeSingle();
    if (taken) return json({ error: "Эта почта уже у другого аккаунта" }, 409);
    const { error } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Эта почта уже у другого аккаунта" : error.message }, 400);
    await db.from("private_info").upsert({ id: userId, email });
    // Старые входы больше не действуют: тот, кто угнал аккаунт, вылетает
    await db.rpc("mod_end_sessions_service", { p_user: userId });
    await db.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
    await log(`почта заменена, все устройства отключены, ссылка для пароля отправлена на новую почту`, "recovery_email");
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
