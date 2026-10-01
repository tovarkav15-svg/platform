"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { useCalls } from "../calls/CallLayer";
import { MessengerShell } from "./MessengerShell";
import { ChatThread } from "./ChatThread";
import { ChatSettings } from "./ChatSettings";

export default function MessagesPage() {
  const { me } = useRequireMe();
  const router = useRouter();
  const chatId = useSearchParams().get("c");
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState("");
  const { startCall } = useCalls();

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("list_chats");
    if (data) setChats(data as ChatListItem[]);
  }, []);

  useEffect(() => {
    document.title = "Мессенджер";
    if (!me) return;
    load();
    const t = setInterval(load, 5000);
    window.addEventListener("chats:refresh", load);
    return () => { clearInterval(t); window.removeEventListener("chats:refresh", load); };
  }, [me, load]);

  useEffect(() => { setSettings(false); }, [chatId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const active = chats?.find((c) => c.chat_id === chatId);

  return (
    <div className="messenger-page">
      <TopBar />
      {me && (
        <MessengerShell chats={chats} activeId={chatId} meId={me.id} onChanged={load}>
          {!chatId ? (
            <div className="chat-placeholder">
              <h2 className="h-xl caps">Выбери <span className="it">чат</span></h2>
              <p className="lead">Или создай группу, канал, найди друга. Если что-то не так, напиши в поддержку.</p>
            </div>
          ) : active ? (
            <>
              <ChatThread
                key={chatId}
                chatId={chatId}
                meId={me.id}
                chat={active}
                onSettings={() => setSettings(true)}
                onCall={async (video) => {
                  if (!active.other_id) return;
                  const err = await startCall(chatId, active.other_id, video);
                  if (err) setToast(err);
                }}
              />
              <ChatSettings chat={active} open={settings} meId={me.id} onClose={() => setSettings(false)} onChanged={load}
                onLeft={() => { setSettings(false); load(); router.replace("/messages/"); }} />
            </>
          ) : chats ? (
            <div className="chat-placeholder"><p className="lead">Чат не найден или ты из него вышел.</p></div>
          ) : (
            <div className="msgs-loading" style={{ margin: "auto" }}><span /><span /><span /></div>
          )}
        </MessengerShell>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
