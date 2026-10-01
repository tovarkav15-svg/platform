"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ChatListItem } from "@/lib/social";
import { Avatar } from "../Avatar";
import { shortTime } from "./time";

export function MessengerShell({ initialChats, children }: { initialChats: ChatListItem[]; children: React.ReactNode }) {
  const activeId = useSelectedLayoutSegment();
  const [chats, setChats] = useState(initialChats);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/chats", { cache: "no-store" });
        if (r.ok && alive) setChats((await r.json()).chats);
      } catch {}
    };
    const t = setInterval(load, 4000);
    window.addEventListener("chats:refresh", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener("chats:refresh", load); };
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? chats.filter((c) => c.other && (c.other.displayName.toLowerCase().includes(s) || c.other.username.includes(s))) : chats;
  }, [chats, q]);

  return (
    <div className="messenger" data-open={activeId ? "chat" : "list"}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h1 className="caps">Чаты</h1>
          <Link href="/friends?tab=find" className="btn ghost sm">Новый</Link>
        </div>
        <div className="input chat-search">
          <input id="chatSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по чатам" autoComplete="off" />
        </div>
        <ul>
          {shown.map((c, i) => c.other && (
            <li key={c.id} style={{ "--i": i } as React.CSSProperties}>
              <Link href={`/messages/${c.id}`} className="chat-item" aria-current={activeId === c.id ? "page" : undefined}>
                <Avatar name={c.other.displayName} avatar={c.other.avatar} accent={c.other.accent} size={46} />
                <span className="chat-item-text">
                  <span className="row"><b>{c.other.displayName}</b>{c.last && <time>{shortTime(c.last.at)}</time>}</span>
                  <span className="row">
                    <small>{c.last ? `${c.last.mine ? "Ты: " : ""}${c.last.text}` : "Нет сообщений"}</small>
                    {c.unread > 0 && <span className="count-badge">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {!chats.length && (
          <div className="chat-list-empty">
            <p className="lead">Чатов пока нет. Найди друзей и напиши первым.</p>
            <Link className="btn sm" href="/friends">К друзьям</Link>
          </div>
        )}
      </aside>
      <section className="chat-pane">{children}</section>
    </div>
  );
}
