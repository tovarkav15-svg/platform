// Нейронка ↔ таблица клиентов из Workspace.
// Вход по личному ключу rlc_… (создаётся в Workspace → Clients → «Нейронка»).
//   MCP (Claude, ChatGPT-коннекторы):  POST /functions/v1/ai/mcp/<ключ>
//   REST для своего GPT (Actions):    /functions/v1/ai/clients, /table + Authorization: Bearer <ключ>
//   Схема OpenAPI:                     GET /functions/v1/ai/openapi.json
// Нейронка может читать, добавлять и менять клиентов, но не удалять.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const db: SupabaseClient = createClient(URL_BASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PUBLIC_URL = `${URL_BASE}/functions/v1/ai`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key, mcp-session-id, mcp-protocol-version, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// ---------- Таблица ----------
type Col = { key: string; title: string; type: string; options?: string[]; base: boolean; max: number };
type Saved = { id: string; title: string; type: string; options?: string[]; base?: boolean; hidden?: boolean };

const BASE: Col[] = [
  { key: "username", title: "@username", type: "text", base: true, max: 60 },
  { key: "sphere", title: "Сфера деятельности", type: "text", base: true, max: 120 },
  { key: "qualify", title: "Квалифай", type: "select", options: ["Горячий", "Тёплый", "Холодный", "Не подходит"], base: true, max: 40 },
  { key: "hypothesis", title: "Гипотеза", type: "text", base: true, max: 1000 },
  { key: "outcome", title: "Итог сделки", type: "select", options: ["В работе", "Сделка", "Пауза", "Отказ"], base: true, max: 40 },
  { key: "comment", title: "Комментарий", type: "text", base: true, max: 2000 },
];
const FIXED = new Set(BASE.map((c) => c.key));
const MAX_ROWS_PER_CALL = 100;
const MAX_CLIENTS = 5000;

const norm = (s: string) => s.toLowerCase().replace(/^@/, "").replace(/[\s_*`«»"'.:-]/g, "");
const uname = (s: string) => s.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?t\.me\//i, "").replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();

async function loadLayout(user: string): Promise<{ saved: Saved[]; cols: Col[] }> {
  const { data } = await db.from("workspace_settings").select("client_columns").eq("user_id", user).maybeSingle();
  const saved: Saved[] = Array.isArray(data?.client_columns) ? data!.client_columns : [];
  const titled = new Map(saved.filter((c) => c.base).map((c) => [c.id, c.title]));
  const cols: Col[] = [
    ...BASE.map((b) => ({ ...b, title: titled.get(b.key)?.trim() || b.title })),
    ...saved.filter((c) => !c.base && c.id).map((c) => ({ key: c.id, title: c.title, type: c.type, options: c.options, base: false, max: 2000 })),
  ];
  return { saved, cols };
}

function findCol(cols: Col[], name: string) {
  const n = norm(name);
  if (["username", "ник", "telegram", "юзернейм", "nick"].includes(n)) return cols.find((c) => c.key === "username");
  return cols.find((c) => c.key === name || norm(c.title) === n || (c.base && norm(BASE.find((b) => b.key === c.key)!.title) === n));
}

function fit(col: Col, v: unknown) {
  let s = String(v ?? "").trim();
  if (col.key === "username") s = s.replace(/^@+/, "");
  if (col.type === "select" && col.options?.length) s = col.options.find((o) => o.toLowerCase() === s.toLowerCase()) ?? s;
  if (col.type === "number") s = s.replace(/\s/g, "").replace(",", ".");
  return s.slice(0, col.max);
}

function view(r: Record<string, unknown>, cols: Col[]) {
  const out: Record<string, string> = { id: String(r.id) };
  for (const c of cols) {
    const v = c.base ? String(r[c.key] ?? "") : String((r.extra as Record<string, string>)?.[c.key] ?? "");
    if (v) out[c.title] = c.key === "username" && !/[./]/.test(v) ? `@${v}` : v;
  }
  return out;
}

/** Описание таблицы: колонки, варианты, сколько клиентов */
async function tableInfo(user: string) {
  const { cols } = await loadLayout(user);
  const { count } = await db.from("clients").select("id", { count: "exact", head: true }).eq("user_id", user);
  return {
    clients: count ?? 0,
    columns: cols.map((c) => ({ title: c.title, type: c.type, ...(c.options?.length ? { options: c.options } : {}), max_length: c.max })),
    rules: "Поля передаются по названию колонки. @username обязателен и уникален: клиенты с уже существующим ником пропускаются. Неизвестные поля станут новыми текстовыми колонками.",
  };
}

async function listClients(user: string, query = "", limit = 50) {
  const { cols } = await loadLayout(user);
  const { data } = await db.from("clients").select("*").eq("user_id", user).order("position").limit(MAX_CLIENTS);
  const q = query.trim().toLowerCase();
  const rows = (data ?? []).map((r) => view(r, cols)).filter((r) => !q || Object.values(r).some((v) => v.toLowerCase().includes(q)));
  return { total: rows.length, shown: Math.min(rows.length, limit), clients: rows.slice(0, Math.max(1, Math.min(limit, 200))) };
}

/** Новые колонки для полей, которых нет в таблице */
async function ensureColumns(user: string, saved: Saved[], cols: Col[], names: string[]) {
  const fresh: Saved[] = [];
  for (const n of names) {
    const t = n.trim().slice(0, 40);
    if (!t || findCol(cols, t) || fresh.some((f) => norm(f.title) === norm(t)) || fresh.length >= 10) continue;
    fresh.push({ id: `c_${crypto.randomUUID().slice(0, 8)}`, title: t, type: "text" });
  }
  if (!fresh.length) return cols;
  // Старые настройки без базовых колонок: базовые встают первыми
  const hasBase = saved.some((c) => c.base);
  const next = [...(hasBase ? saved : [...BASE.map((b) => ({ id: b.key, title: b.title, type: "text", base: true })), ...saved]), ...fresh];
  await db.from("workspace_settings").upsert({ user_id: user, client_columns: next, updated_at: new Date().toISOString() });
  return [...cols, ...fresh.map((f) => ({ key: f.id, title: f.title, type: "text", base: false, max: 2000 }))];
}

async function addClients(user: string, items: unknown) {
  if (!Array.isArray(items) || !items.length) throw new Error("Передай массив clients: [{ \"@username\": \"...\", ... }]");
  if (items.length > MAX_ROWS_PER_CALL) throw new Error(`За один раз не больше ${MAX_ROWS_PER_CALL} клиентов`);
  const { saved, cols: base } = await loadLayout(user);
  const { data: existing } = await db.from("clients").select("username, position").eq("user_id", user).order("position", { ascending: false }).limit(MAX_CLIENTS);
  if ((existing?.length ?? 0) + items.length > MAX_CLIENTS) throw new Error(`В таблице может быть не больше ${MAX_CLIENTS} клиентов`);
  const known = new Set((existing ?? []).map((r) => uname(r.username)).filter(Boolean));
  let pos = Number(existing?.[0]?.position ?? 0) + 1;

  const objs = items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const unknown = Array.from(new Set(objs.flatMap((o) => Object.keys(o)).filter((k) => !findCol(base, k))));
  const cols = await ensureColumns(user, saved, base, unknown);

  const payload: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  for (const o of objs) {
    const row: Record<string, unknown> = { user_id: user, extra: {}, position: pos };
    for (const [k, v] of Object.entries(o)) {
      const col = findCol(cols, k);
      if (!col || v === null || v === undefined || String(v).trim() === "") continue;
      const val = fit(col, v);
      if (FIXED.has(col.key)) row[col.key] = val;
      else (row.extra as Record<string, string>)[col.key] = val;
    }
    const name = uname(String(row.username ?? ""));
    if (!name) { skipped.push("(без @username)"); continue; }
    if (known.has(name)) { skipped.push(`@${name}`); continue; }
    known.add(name);
    payload.push(row);
    pos++;
  }
  let added = 0;
  if (payload.length) {
    const { data, error } = await db.from("clients").insert(payload).select("id");
    if (error) throw new Error(`Не сохранилось: ${error.message}`);
    added = data?.length ?? 0;
  }
  return {
    added,
    skipped_duplicates: skipped,
    new_columns: cols.slice(base.length).map((c) => c.title),
    message: `Добавлено клиентов: ${added}${skipped.length ? `, пропущено (уже есть или без ника): ${skipped.length}` : ""}`,
  };
}

async function updateClient(user: string, args: Record<string, unknown>) {
  const fields = (args.fields ?? {}) as Record<string, unknown>;
  if (!Object.keys(fields).length) throw new Error("Передай fields: { \"Колонка\": \"значение\" }");
  const { saved, cols: base } = await loadLayout(user);
  const { data: rows } = await db.from("clients").select("*").eq("user_id", user).limit(MAX_CLIENTS);
  const target = args.id
    ? rows?.find((r) => r.id === args.id)
    : rows?.find((r) => r.username && uname(r.username) === uname(String(args.username ?? "")));
  if (!target) throw new Error("Клиент не найден. Укажи id или @username из list_clients");
  const cols = await ensureColumns(user, saved, base, Object.keys(fields).filter((k) => !findCol(base, k)));
  const patch: Record<string, unknown> = { extra: { ...(target.extra ?? {}) }, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    const col = findCol(cols, k);
    if (!col) continue;
    const val = fit(col, v);
    if (FIXED.has(col.key)) patch[col.key] = val;
    else (patch.extra as Record<string, string>)[col.key] = val;
  }
  const { error } = await db.from("clients").update(patch).eq("id", target.id).eq("user_id", user);
  if (error) throw new Error(`Не сохранилось: ${error.message}`);
  return { updated: view({ ...target, ...patch }, cols) };
}

// ---------- MCP ----------
const TOOLS = [
  {
    name: "get_table_info",
    description: "Колонки таблицы клиентов (названия, типы, варианты для списков) и сколько клиентов уже есть. Вызывай первым, чтобы заполнять колонки правильно.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_clients",
    description: "Клиенты из таблицы. Поиск по любому полю. Используй, чтобы не добавлять тех, кто уже есть.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Текст для поиска, можно пусто" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_clients",
    description: "Добавить найденных клиентов в таблицу (до 100 за раз). Ключи — названия колонок из get_table_info, например {\"@username\": \"@ivan\", \"Сфера деятельности\": \"Кофейня\", \"Квалифай\": \"Тёплый\", \"Гипотеза\": \"...\"}. @username обязателен; дубликаты пропускаются. Новые поля станут колонками.",
    inputSchema: {
      type: "object", required: ["clients"],
      properties: { clients: { type: "array", maxItems: MAX_ROWS_PER_CALL, items: { type: "object", additionalProperties: { type: "string" } } } },
    },
  },
  {
    name: "update_client",
    description: "Изменить поля одного клиента: найти по id или @username и записать fields, например {\"Квалифай\": \"Горячий\", \"Комментарий\": \"Ответил, ждёт КП\"}.",
    inputSchema: {
      type: "object", required: ["fields"],
      properties: { id: { type: "string" }, username: { type: "string" }, fields: { type: "object", additionalProperties: { type: "string" } } },
    },
  },
];

async function callTool(user: string, name: string, args: Record<string, unknown>) {
  if (name === "get_table_info") return tableInfo(user);
  if (name === "list_clients") return listClients(user, String(args.query ?? ""), Number(args.limit ?? 50));
  if (name === "add_clients") return addClients(user, args.clients);
  if (name === "update_client") return updateClient(user, args);
  throw new Error(`Нет такого инструмента: ${name}`);
}

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

async function mcp(req: Request, user: string) {
  const msg = await req.json().catch(() => null);
  if (!msg) return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of batch) {
    if (m.id === undefined || m.id === null) continue; // уведомления без ответа
    try {
      let result: unknown;
      switch (m.method) {
        case "initialize": {
          const v = PROTOCOLS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : PROTOCOLS[0];
          result = {
            protocolVersion: v,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "relic-clients", title: "Relic · таблица клиентов", version: "1.0.0" },
            instructions: "Это таблица клиентов пользователя платформы Relic. Сначала вызови get_table_info. Когда находишь клиентов, добавляй их через add_clients с @username (ник в Telegram или ссылка), сферой и гипотезой. Ничего не выдумывай: добавляй только реальных людей и компании, которых нашёл.",
          };
          break;
        }
        case "ping": result = {}; break;
        case "tools/list": result = { tools: TOOLS }; break;
        case "tools/call": {
          try {
            const data = await callTool(user, m.params?.name, m.params?.arguments ?? {});
            result = { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: data };
          } catch (e) {
            result = { content: [{ type: "text", text: (e as Error).message }], isError: true };
          }
          break;
        }
        default:
          out.push({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
          continue;
      }
      out.push({ jsonrpc: "2.0", id: m.id, result });
    } catch (e) {
      out.push({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: (e as Error).message } });
    }
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(msg) ? out : out[0]);
}

// ---------- OpenAPI для своего GPT ----------
const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "Relic · таблица клиентов", version: "1.0.0", description: "Чтение и пополнение личной таблицы клиентов в Workspace." },
  servers: [{ url: PUBLIC_URL }],
  components: {
    securitySchemes: { key: { type: "http", scheme: "bearer" } },
    schemas: {
      Client: { type: "object", additionalProperties: { type: "string" }, description: "Поля по названиям колонок, например @username, Сфера деятельности, Квалифай, Гипотеза" },
    },
  },
  security: [{ key: [] }],
  paths: {
    "/table": { get: { operationId: "getTableInfo", summary: "Колонки таблицы и число клиентов", responses: { "200": { description: "OK" } } } },
    "/clients": {
      get: {
        operationId: "listClients", summary: "Клиенты, поиск по любому полю",
        parameters: [
          { name: "query", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 200 } },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "addClients", summary: "Добавить клиентов (до 100 за раз, дубликаты по @username пропускаются)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["clients"], properties: { clients: { type: "array", items: { $ref: "#/components/schemas/Client" } } } } } } },
        responses: { "200": { description: "OK" } },
      },
      patch: {
        operationId: "updateClient", summary: "Изменить поля клиента по id или @username",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["fields"], properties: { id: { type: "string" }, username: { type: "string" }, fields: { $ref: "#/components/schemas/Client" } } } } } },
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

// ---------- Вход ----------
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function userFor(token: string | null) {
  if (!token || !/^rlc_[0-9a-f]{48}$/.test(token)) return null;
  const { data } = await db.rpc("ai_token_user", { p_hash: await sha256(token) });
  return (data as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^.*?\/ai(?=\/|$)/, "").split("/").filter(Boolean);

  if (parts[0] === "openapi.json") return json(OPENAPI);
  if (!parts.length) return json({ name: "Relic · таблица клиентов", docs: `${PUBLIC_URL}/openapi.json` });

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("x-api-key");
  const token = parts[0] === "mcp" && parts[1] ? parts[1] : bearer;
  const user = await userFor(token);
  if (!user) return json({ error: "Нужен действующий ключ rlc_… из Workspace → Clients → Нейронка" }, 401);

  try {
    if (parts[0] === "mcp") {
      if (req.method === "GET") return new Response("SSE не поддерживается: используй POST", { status: 405, headers: { ...CORS, Allow: "POST" } });
      if (req.method === "DELETE") return new Response(null, { status: 204, headers: CORS });
      return await mcp(req, user);
    }
    if (parts[0] === "table" && req.method === "GET") return json(await tableInfo(user));
    if (parts[0] === "clients") {
      if (req.method === "GET") return json(await listClients(user, url.searchParams.get("query") ?? "", Number(url.searchParams.get("limit") ?? 50)));
      const body = await req.json().catch(() => ({}));
      if (req.method === "POST") return json(await addClients(user, body.clients));
      if (req.method === "PATCH") return json(await updateClient(user, body));
    }
    return json({ error: "Нет такого адреса. Список: /openapi.json" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
