// Письмо для смены пароля по юзернейму. Почту аккаунта знает только сервер: наружу она не уходит,
// ответ одинаковый, есть такой аккаунт или нет.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
// Куда может вести ссылка из письма: только сам сайт и локальная разработка
const REDIRECTS = ["https://tovarkav15-svg.github.io/platform/reset/", "http://localhost:3000/reset/"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: { login?: string; redirectTo?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const login = String(body.login ?? "").trim();
  const redirectTo = REDIRECTS.includes(String(body.redirectTo)) ? String(body.redirectTo) : REDIRECTS[0];
  if (!login || login.length > 320) return json({ error: "empty" }, 400);

  let email: string | null = null;
  if (login.includes("@") && !login.startsWith("@")) email = login.toLowerCase();
  else {
    const name = login.replace(/^@/, "").toLowerCase();
    const { data: p } = await db.from("profiles").select("id").eq("username", name).maybeSingle();
    if (p) email = (await db.auth.admin.getUserById(p.id)).data.user?.email ?? null;
  }
  if (email) {
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
    if (error && /rate|seconds|limit/i.test(error.message)) return json({ ok: false, reason: "rate" }, 429);
  }
  return json({ ok: true });
});
