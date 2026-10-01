"use client";

import type { ChatListItem } from "@/lib/supabase";
import { accentColor } from "@/lib/style";
import { Avatar } from "../Avatar";

export const KIND_ICON = { group: "◍", channel: "◈", support: "✚", dm: "" } as const;
export const KIND_NAME = { group: "Группа", channel: "Канал", support: "Поддержка", dm: "Личный чат" } as const;

export function chatTitle(c: ChatListItem) {
  return c.kind === "dm" ? c.other_name ?? "Чат" : c.title || KIND_NAME[c.kind];
}

/** Аватар чата: для лички — человек со статусом, для группы и канала — своя картинка или эмодзи на цвете */
export function ChatAvatar({ c, size = 46 }: { c: Pick<ChatListItem, "kind" | "avatar" | "accent" | "emoji" | "title" | "other_id" | "other_name" | "other_avatar" | "other_accent">; size?: number }) {
  if (c.kind === "dm") {
    return <Avatar name={c.other_name ?? "?"} avatar={c.other_avatar} accent={c.other_accent ?? "edit"} size={size} userId={c.other_id} />;
  }
  const color = c.kind === "support" ? "#1FA67A" : accentColor(c.accent);
  return (
    <span className={`chat-ava k-${c.kind}`} style={{ width: size, height: size, "--c": color, fontSize: size * 0.42 } as React.CSSProperties}>
      {c.avatar ? <img src={c.avatar} alt="" /> : c.emoji ? <span className="chat-ava-emoji">{c.emoji}</span> : c.kind === "support" ? <SupportMark /> : (c.title || "?").slice(0, 1).toUpperCase()}
      {c.kind !== "support" && <i className="chat-ava-kind" aria-hidden="true">{KIND_ICON[c.kind]}</i>}
    </span>
  );
}

export function SupportMark() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" aria-hidden="true">
      <path fill="currentColor" d="M12 2a10 10 0 0 0-10 10v5a3 3 0 0 0 3 3h2v-7H4v-1a8 8 0 0 1 16 0v1h-3v7h3v1a2 2 0 0 1-2 2h-4v2h4a4 4 0 0 0 4-4v-9A10 10 0 0 0 12 2z" />
    </svg>
  );
}
