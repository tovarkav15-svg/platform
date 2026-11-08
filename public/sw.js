// Помощник установленного приложения Relic.
// Запоминает только «оболочку» сайта: код, стили, шрифты, иконки. Ответы базы (чаты, Workspace, деньги)
// идут на другой адрес, их помощник не трогает и на устройстве не хранит.
// Страницы сначала грузятся из сети, сохранённое — только когда сети нет, поэтому новая версия приходит сразу.
const VERSION = "v8";
const STATIC = `relic-static-${VERSION}`;
const PAGES = `relic-pages-${VERSION}`;
const FONTS = "relic-fonts";
const BASE = new URL("./", self.location).pathname; // /platform/ на сайте

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  const keep = [STATIC, PAGES, FONTS];
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Хранилище не растёт бесконечно: старые записи уходят
async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, name, max) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    const c = await caches.open(name);
    c.put(req, res.clone()).then(() => trim(name, max));
  }
  return res;
}

async function networkFirst(req, fallbackToRoot) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(PAGES);
      c.put(req, res.clone()).then(() => trim(PAGES, 80));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (fallbackToRoot) {
      const root = await caches.match(BASE);
      if (root) return root;
    }
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Шрифты Google — общие для всех, их можно держать
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req, FONTS, 30));
    return;
  }
  // Всё чужое (база, файлы пользователей, звонки) — мимо помощника
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Код и стили с отпечатком в имени не меняются — берём из памяти
  if (url.pathname.startsWith(`${BASE}_next/static/`) || url.pathname.startsWith(`${BASE}app/`) || url.pathname.startsWith(`${BASE}brand/`)) {
    e.respondWith(cacheFirst(req, STATIC, 300));
    return;
  }
  // Страницы и данные для переходов — сначала сеть
  e.respondWith(networkFirst(req, req.mode === "navigate"));
});

// Уведомления на телефон: новое сообщение пришло, когда сайт закрыт
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "Relic", {
    body: d.body || "Новое сообщение",
    tag: d.tag,
    renotify: !!d.tag,
    icon: `${BASE}app/icon-192.png`,
    badge: `${BASE}app/icon-192.png`,
    data: { url: d.url || "messages/" },
  }));
});

// Нажали на уведомление — открываем этот чат в уже открытом окне Relic или в новом
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "messages/", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { await win.focus(); return win.navigate ? win.navigate(url) : undefined; }
    return self.clients.openWindow(url);
  })());
});
