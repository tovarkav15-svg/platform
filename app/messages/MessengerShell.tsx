"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChatListItem } from "@/lib/supabase";
import { chatHref } from "@/lib/links";
import { Avatar } from "../Avatar";
import { shortTime } from "./time";

type Props = { chats: ChatListItem[] | null; activeId: string | null; children: React.ReactNode };

export function MessengerShell({ chats, activeId, children }: Props) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = chats ?? [];
    return s ? list.filter((c) => c.other_name.toLowerCase().includes(s) || c.other_username.includes(s)) : list;
  }, [chats, q]);

  return (
    <div className="messenger" data-open={activeId ? "chat" : "list"}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h1 className="caps">Чаты</h1>
          <Link href="/friends/?tab=find" className="btn ghost sm">Новый</Link>
        </div>
        <div className="input chat-search">
          <input id="chatSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по чатам" autoComplete="off" />
        </div>
        <ul>
          {shown.map((c, i) => (
            <li key={c.chat_id} style={{ "--i": i } as React.CSSProperties}>
              <Link href={chatHref(c.chat_id)} className="chat-item" aria-current={activeId === c.chat_id ? "page" : undefined}>
                <Avatar name={c.other_name} avatar={c.other_avatar} accent={c.other_accent} size={46} />
                <span className="chat-item-text">
                  <span className="row"><b>{c.other_name}</b>{c.last_at && <time>{shortTime(c.last_at)}</time>}</span>
                  <span className="row">
                    <small>{c.last_text ? `${c.last_mine ? "Ты: " : ""}${c.last_text}` : "Нет сообщений"}</small>
                    {c.unread > 0 && <span className="count-badge">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {chats && !chats.length && (
          <div className="chat-list-empty">
            <p className="lead">Чатов пока нет. Найди друзей и напиши первым.</p>
            <Link className="btn sm" href="/friends/">К друзьям</Link>
          </div>
        )}
      </aside>
      <section className="chat-pane">{children}</section>
    </div>
  );
}
