"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { ChatAvatar, chatTitle } from "./ChatAvatar";
import { shortTime } from "./time";

// Быстрый просмотр чата, как в Telegram: последние сообщения поверх списка, без отметки о прочтении
type Row = { id: string; text: string; sender_id: string; created_at: string; kind: string; deleted_at: string | null };
const KIND: Record<string, string> = { image: "Фото", video: "Видео", voice: "Голосовое сообщение", file: "Файл", sticker: "Стикер" };

export function ChatPeek({ chat, meId, onOpen, onClose, onRead }: { chat: ChatListItem; meId: string; onOpen: () => void; onClose: () => void; onRead: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const box = useRef<HTMLDivElement>(null);
  const multi = chat.kind !== "dm";

  useEffect(() => {
    let alive = true;
    supabase.from("messages").select("id, text, sender_id, created_at, kind, deleted_at").eq("chat_id", chat.chat_id)
      .order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (alive) setRows(((data as Row[]) ?? []).reverse()); });
    if (multi) supabase.rpc("chat_people", { p_chat: chat.chat_id }).then(({ data }) => {
      if (alive) setNames(new Map(((data as { user_id: string; display_name: string }[]) ?? []).map((p) => [p.user_id, p.display_name])));
    });
    return () => { alive = false; };
  }, [chat.chat_id, multi]);

  useEffect(() => { if (rows && box.current) box.current.scrollTop = box.current.scrollHeight; }, [rows]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") onOpen(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, onOpen]);

  return (
    <div className="peek-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onContextMenu={(e) => e.preventDefault()}>
      <div className="peek" role="dialog" aria-label={`Быстрый просмотр: ${chatTitle(chat)}`}>
        <header className="peek-head">
          <ChatAvatar c={chat} size={36} />
          <span className="peek-title"><b>{chatTitle(chat)}</b><small>{chat.unread > 0 ? `${chat.unread} непрочитанных · останутся непрочитанными` : "Быстрый просмотр"}</small></span>
          <button type="button" className="icon-btn sm" aria-label="Закрыть" onClick={onClose}>×</button>
        </header>
        <div className="peek-body" ref={box}>
          {!rows ? <div className="peek-empty">Загружаю…</div> : !rows.length ? <div className="peek-empty">Сообщений пока нет</div> : rows.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = rows[i - 1];
            if (m.kind === "system") return <div key={m.id} className="peek-sys">{m.text}</div>;
            const body = m.deleted_at ? "Сообщение удалено" : (m.kind !== "text" && m.kind !== "sticker" ? `${KIND[m.kind] ?? "Вложение"}${m.text ? ` · ${m.text}` : ""}` : m.kind === "sticker" ? "Стикер" : m.text);
            return (
              <div key={m.id} className={`peek-msg ${mine ? "mine" : ""} ${m.deleted_at ? "del" : ""}`}>
                {multi && !mine && prev?.sender_id !== m.sender_id && <small className="peek-who">{names.get(m.sender_id) ?? "Участник"}</small>}
                <span>{body}<time>{shortTime(m.created_at)}</time></span>
              </div>
            );
          })}
        </div>
        <footer className="peek-foot">
          {chat.unread > 0 && <button type="button" className="btn ghost sm" onClick={onRead}>Отметить прочитанным</button>}
          <button type="button" className="btn sm" onClick={onOpen}>Открыть чат</button>
        </footer>
      </div>
    </div>
  );
}
