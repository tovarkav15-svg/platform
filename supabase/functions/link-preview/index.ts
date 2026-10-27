// Карточка ссылки для чатов, как в Telegram: заголовок, описание, картинка и название сайта.
// Вызывается только вошедшими пользователями (проверка JWT включена). Результат кэшируется на 7 дней.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const TTL = 7 * 24 * 3600 * 1000;
const MAX_BYTES = 512 * 1024;

type Preview = { url: string; site?: string; title?: string; description?: string; image?: string; icon?: string } | null;

// Не ходим во внутренние сети и на служебные адреса
function privateIp(ip: string) {
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  const c = ip.match(/^100\.(\d+)\./); if (c && +c[1] >= 64 && +c[1] <= 127) return true;
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}
async function safeUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return privateIp(host.replace(/^\[|\]$/g, "")) ? null : u;
  try {
    const ips = [...(await Deno.resolveDns(host, "A").catch(() => [])), ...(await Deno.resolveDns(host, "AAAA").catch(() => []))];
    if (!ips.length || ips.some(privateIp)) return null;
  } catch { return null; }
  return u;
}

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, " ").trim();

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i");
    const m = html.match(re1) ?? html.match(re2);
    if (m?.[1]?.trim()) return decode(m[1]);
  }
  return undefined;
}

// YouTube из европейских дата-центров отдаёт страницу согласия на cookies, поэтому берём данные из его oEmbed
async function youtube(u: URL): Promise<Preview> {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.toString())}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const o = await r.json();
  return { url: u.toString(), site: "YouTube", title: String(o.title ?? "").slice(0, 200), description: o.author_name ? String(o.author_name).slice(0, 200) : undefined, image: o.thumbnail_url, icon: "https://www.youtube.com/favicon.ico" };
}

async function fetchPreview(raw: string): Promise<Preview> {
  let url = await safeUrl(raw);
  if (!url) return null;
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return youtube(url);
  let res: Response | null = null;
  // Переходы по редиректам вручную, чтобы проверять каждый адрес
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(url, {
      redirect: "manual", signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RelicPreview/1.0; +https://tovarkav15-svg.github.io/platform/)", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "ru,en;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await safeUrl(new URL(res.headers.get("location")!, url).toString());
      if (!url) return null;
      continue;
    }
    break;
  }
  if (!res || !res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (type.startsWith("image/")) return { url: url.toString(), site: url.hostname.replace(/^www\./, ""), image: url.toString() };
  if (!type.includes("html")) return null;

  // Читаем только начало страницы
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value); size += value.length;
    if (new TextDecoder().decode(value).includes("</head>")) break;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size); let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
  const charset = type.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  let html = new TextDecoder(charset === "windows-1251" ? "windows-1251" : "utf-8").decode(buf);
  const metaCharset = html.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
  if (!charset && metaCharset === "windows-1251") html = new TextDecoder("windows-1251").decode(buf);

  const abs = (v?: string) => { if (!v) return undefined; try { const a = new URL(v, url!); return a.protocol === "https:" || a.protocol === "http:" ? a.toString() : undefined; } catch { return undefined; } };
  const title = meta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]) : undefined);
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const image = abs(meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]));
  const site = meta(html, ["og:site_name", "application-name"]) ?? url.hostname.replace(/^www\./, "");
  const iconHref = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
  const icon = abs(iconHref) ?? `${url.origin}/favicon.ico`;
  if (!title && !description && !image) return null;
  return {
    url: url.toString(),
    site: site?.slice(0, 80),
    title: title?.slice(0, 200),
    description: description?.slice(0, 400),
    image: image?.slice(0, 1000),
    icon: icon?.slice(0, 1000),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST" }, 405);
  // Только вошедшие пользователи: публичного ключа сайта недостаточно
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = token.startsWith("ey") ? await db.auth.getUser(token) : { data: null };
  if (!who?.user) return json({ error: "Нужно войти в аккаунт" }, 401);
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || url.length > 2000) return json({ preview: null });
  const key = url.trim();

  const { data: hit } = await db.from("link_previews").select("data, fetched_at").eq("url", key).maybeSingle();
  if (hit && Date.now() - new Date(hit.fetched_at).getTime() < TTL) return json({ preview: Object.keys(hit.data ?? {}).length ? hit.data : null });

  let preview: Preview = null;
  try { preview = await fetchPreview(key); } catch { preview = null; }
  await db.from("link_previews").upsert({ url: key, data: preview ?? {}, fetched_at: new Date().toISOString() });
  return json({ preview });
});
