"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { MessengerShell } from "./MessengerShell";
import { ChatThread } from "./ChatThread";

export default function MessagesPage() {
  const { me } = useRequireMe();
  const chatId = useSearchParams().get("c");
  const [chats, setChats] = useState<ChatListItem[] | null>(null);

  useEffect(() => {
    document.title = "Мессенджер";
    if (!me) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc("list_chats");
      if (alive && data) setChats(data as ChatListItem[]);
    };
    load();
    const t = setInterval(load, 5000);
    window.addEventListener("chats:refresh", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener("chats:refresh", load); };
  }, [me]);

  const active = chats?.find((c) => c.chat_id === chatId);

  return (
    <div className="messenger-page">
      <TopBar />
      <MessengerShell chats={chats} activeId={chatId}>
        {!me || !chatId ? (
          <div className="chat-placeholder">
            <h2 className="h-xl caps">Выбери <span className="it">чат</span></h2>
            <p className="lead">Или найди друга и напиши первым.</p>
          </div>
        ) : active ? (
          <ChatThread
            key={chatId}
            chatId={chatId}
            meId={me.id}
            other={{ username: active.other_username, displayName: active.other_name, avatar: active.other_avatar, accent: active.other_accent }}
          />
        ) : chats ? (
          <div className="chat-placeholder"><p className="lead">Чат не найден.</p></div>
        ) : (
          <div className="msgs-loading" style={{ margin: "auto" }}><span /><span /><span /></div>
        )}
      </MessengerShell>
    </div>
  );
}
