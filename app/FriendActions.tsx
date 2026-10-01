"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { friendsApi, openDm } from "@/lib/api";
import { chatHref } from "@/lib/links";
import type { FriendState } from "@/lib/supabase";

type Props = { userId: string; state: FriendState; compact?: boolean; onChange?: () => void };

// Кнопки дружбы: одинаковые в профиле и в списках
export function FriendActions({ userId, state, compact, onChange }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (state === "self") return null;
  const cls = compact ? "sm" : "";

  const run = (key: string, fn: () => PromiseLike<unknown>) => async () => {
    setBusy(key);
    await fn();
    setBusy(null);
    onChange?.();
    window.dispatchEvent(new Event("friends:refresh"));
  };

  const write = async () => {
    setBusy("write");
    try { router.push(chatHref(await openDm(userId))); } catch { setBusy(null); }
  };

  const btn = (key: string, label: string, pendingLabel: string, onClick: () => void, ghost = false) => (
    <button type="button" className={`btn ${ghost ? "ghost" : ""} ${cls}`} disabled={!!busy} onClick={onClick}>
      {busy === key ? pendingLabel : label}
    </button>
  );

  return (
    <div className="friend-actions">
      {state === "none" && btn("send", "Добавить в друзья", "Отправляю…", run("send", () => friendsApi.send(userId)))}
      {state === "outgoing" && btn("cancel", "Заявка отправлена · отменить", "Отменяю…", run("cancel", () => friendsApi.remove(userId)), true)}
      {state === "incoming" && (
        <>
          {btn("accept", "Принять", "Принимаю…", run("accept", () => friendsApi.accept(userId)))}
          {btn("decline", "Отклонить", "…", run("decline", () => friendsApi.remove(userId)), true)}
        </>
      )}
      {state === "friends" && !compact && btn("remove", "Удалить из друзей", "Удаляю…", run("remove", () => friendsApi.remove(userId)), true)}
      {btn("write", "Написать", "Открываю…", write, state !== "friends")}
    </div>
  );
}
