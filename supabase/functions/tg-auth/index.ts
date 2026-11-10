// Вход в Relic через Telegram (мини-приложение @relicprodbot).
// Telegram подписывает данные о человеке ключом бота; функция проверяет подпись — подделать вход нельзя.
//   mode "login"  — если Telegram привязан к аккаунту, выдаёт одноразовый ключ входа; иначе { status: "new" }
//   mode "link"   — привязывает Telegram к аккаунту, в который уже вошли (нужен заголовок Authorization)
//   mode "signup" — создаёт новый аккаунт на этот Telegram и сразу входит
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BOT = Deno.env.get("TG_BOT_TOKEN")!;
const MAX_AGE = 24 * 3600; // подпись Telegram действует сутки

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(key: Uint8Array | ArrayBuffer, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; allows_write_to_pm?: boolean };

/** Проверка подписи по правилам Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
async function verify(initData: string): Promise<TgUser | null> {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(enc.encode("WebAppData"), BOT);
  const sig = hex(await hmac(secret, check));
  if (sig.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;
  const age = Date.now() / 1000 - Number(p.get("auth_date") || 0);
  if (!(age >= -60 && age < MAX_AGE)) return null;
  try { return JSON.parse(p.get("user") || "null"); } catch { return null; }
}

/** Одноразовый ключ входа: браузер обменяет его на сессию (verifyOtp) */
async function loginToken(userId: string) {
  const { data: u } = await db.auth.admin.getUserById(userId);
  const email = u.user?.email;
  if (!email) return null;
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return null;
  return data.properties?.hashed_token ?? null;
}

const RESERVED = new Set(["admin", "root", "support", "help", "api", "home", "login", "logout", "register", "settings", "learn", "chat", "goals", "calendar", "finance", "marathons", "u", "me"]);
const badName = (u: string) =>
  u.length < 3 || u.length > 20 || !/^[a-z0-9._]+$/.test(u) || /^[._]|[._]$/.test(u) || /[._]{2}/.test(u) || RESERVED.has(u);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "bad" }, 405);
  const body = await req.json().catch(() => ({}));
  const tg = typeof body.initData === "string" ? await verify(body.initData) : null;
  if (!tg?.id) return out({ error: "Telegram не подтвердил вход. Открой Relic заново из бота." }, 401);
  const can = tg.allows_write_to_pm !== false;

  const { data: link } = await db.from("tg_links").select("user_id").eq("tg_id", tg.id).maybeSingle();

  if (body.mode === "login") {
    if (!link) return out({ status: "new", first_name: tg.first_name ?? "", username: (tg.username ?? "").toLowerCase() });
    const { data: prof } = await db.from("profiles").select("id").eq("id", link.user_id).maybeSingle();
    if (!prof) return out({ status: "new", first_name: tg.first_name ?? "", username: (tg.username ?? "").toLowerCase() });
    await db.from("tg_links").update({ tg_username: tg.username ?? "", can_write: can }).eq("tg_id", tg.id);
    const token = await loginToken(link.user_id);
    return token ? out({ status: "ok", token }) : out({ error: "Не получилось войти. Попробуй ещё раз." }, 500);
  }

  if (body.mode === "link") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await db.auth.getUser(jwt);
    const uid = who.user?.id;
    if (!uid) return out({ error: "Сначала войди в аккаунт" }, 401);
    if (link && link.user_id !== uid) return out({ status: "other" }); // этот Telegram уже у другого аккаунта
    await db.from("tg_links").upsert({ user_id: uid, tg_id: tg.id, tg_username: tg.username ?? "", can_write: can }, { onConflict: "user_id" });
    return out({ status: link ? "same" : "linked" });
  }

  if (body.mode === "signup") {
    if (link) {
      const token = await loginToken(link.user_id);
      return token ? out({ status: "ok", token }) : out({ error: "Не получилось войти" }, 500);
    }
    const username = String(body.username ?? "").trim().replace(/^@+/, "").toLowerCase();
    const name = String(body.display_name ?? "").trim().slice(0, 40) || tg.first_name || username;
    if (badName(username)) return out({ error: "Юзернейм: 3–20 символов, латиница, цифры, точка и _" }, 400);
    const { data: taken } = await db.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken) return out({ error: "Этот юзернейм уже занят" }, 400);
    const pass = crypto.randomUUID() + crypto.randomUUID();
    const { data: made, error } = await db.auth.admin.createUser({
      email: `tg${tg.id}@telegram.relic`,
      password: pass,
      email_confirm: true,
      user_metadata: { username, display_name: name, niches: "", contact_email: "", ref: String(body.ref ?? "") },
    });
    if (error || !made.user) return out({ error: "Не получилось создать аккаунт. Попробуй другой юзернейм." }, 400);
    await db.from("tg_links").insert({ user_id: made.user.id, tg_id: tg.id, tg_username: tg.username ?? "", can_write: can });
    const token = await loginToken(made.user.id);
    return token ? out({ status: "ok", token }) : out({ error: "Аккаунт создан, но войти не вышло — открой Relic заново" }, 500);
  }

  return out({ error: "bad" }, 400);
});
