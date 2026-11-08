"use client";

import { supabase } from "./supabase";
import { PUSH_READY, VAPID_PUBLIC } from "./config";
import { isIos, isStandalone } from "./pwa";

// Уведомления на телефон о новых сообщениях (Web Push). Подписка устройства хранится в push_subs,
// рассылает серверная функция push. Работают только на сайте (помощник sw.js регистрируется в production).

export type PushState = "on" | "off" | "denied" | "ios-install" | "unsupported";

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function key(b64: string) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  if (process.env.NODE_ENV !== "production") return null;
  return navigator.serviceWorker.getRegistration().then((r) => r ?? navigator.serviceWorker.ready);
}

export async function pushState(): Promise<PushState> {
  if (!PUSH_READY) return "unsupported";
  // На iPhone уведомления приходят только в установленное приложение (iOS 16.4+)
  if (isIos() && !isStandalone()) return "ios-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  if (!j.keys) return false;
  const { error } = await supabase.rpc("save_push_sub", { p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
  return !error;
}

/** Включить: спросить разрешение, подписать устройство и запомнить подписку. Возвращает итоговое состояние */
export async function enablePush(): Promise<PushState> {
  const st = await pushState();
  if (st === "ios-install" || st === "unsupported" || st === "denied") return st;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID_PUBLIC) }));
  return (await save(sub)) ? "on" : "off";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subs").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

/** Подписка уже есть — освежаем запись (после входа в другой аккаунт на этом же устройстве) */
export async function syncPush() {
  if ((await pushState()) !== "on") return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) await save(sub);
}
