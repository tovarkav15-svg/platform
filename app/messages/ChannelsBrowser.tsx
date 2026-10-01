"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal } from "../Modal";
import { ChatAvatar } from "./ChatAvatar";

type Channel = { chat_id: string; title: string; description: string; avatar: string | null; accent: string; emoji: string; member_count: number; joined: boolean };

export function ChannelsBrowser({ open, onClose, onJoined }: { open: boolean; onClose: () => void; onJoined: (id: string) => void }) {
  const [list, setList] = useState<Channel[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    supabase.rpc("public_channels").then(({ data }) => setList((data as Channel[]) ?? []));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={<>Открытые <span className="it">каналы</span></>}>
      {list === null ? <div className="skeleton list-skeleton" /> : list.length ? (
        <ul className="channels">
          {list.map((c, i) => (
            <li key={c.chat_id} style={{ "--i": i } as React.CSSProperties}>
              <ChatAvatar size={48} c={{ kind: "channel", avatar: c.avatar, accent: c.accent, emoji: c.emoji, title: c.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
              <span className="channels-text"><b>{c.title}</b><small>{c.description || "Без описания"}</small><em>{c.member_count} подписчиков</em></span>
              <button type="button" className={`btn sm ${c.joined ? "ghost" : ""}`} onClick={async () => {
                if (!c.joined) await supabase.rpc("join_channel", { p_chat: c.chat_id });
                onJoined(c.chat_id);
              }}>{c.joined ? "Открыть" : "Подписаться"}</button>
            </li>
          ))}
        </ul>
      ) : <p className="lead">Открытых каналов пока нет. Создай первый: «+ Новый» → «Канал».</p>}
    </Modal>
  );
}
