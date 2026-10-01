"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { chatHref } from "@/lib/links";
import { ChatAvatar, chatTitle } from "../messages/ChatAvatar";
import { StickerArt } from "@/lib/stickers";

type Note = { id: string; chat: ChatListItem; sender: string; text: string; kind: string; at: number };
const LABEL: Record<string, string> = { image: "📷 Фото", video: "🎬 Видео", voice: "🎤 Голосовое", file: "📎 Файл" };

/**
 * Всплывающие уведомления о новых сообщениях. База отдаёт только сообщения из моих чатов (RLS),
 * поэтому подписка общая. Не показываем, если чат уже открыт, если это я или я в фокусе.
 */
export function NotifyLayer() {
  const { me } = useSession();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const chats = useRef<Map<string, ChatListItem>>(new Map());
  const names = useRef<Map<string, string>>(new Map());
  const openChat = path.startsWith("/messages") ? sp.get("c") : null;
  const openRef = useRef(openChat);
  openRef.current = openChat;
  const audio = useRef<AudioContext | null>(null);

  const loadChats = useCallback(async () => {
    const { data } = await supabase.rpc("list_chats");
    chats.current = new Map(((data as ChatListItem[]) ?? []).map((c) => [c.chat_id, c]));
  }, []);

  // Тихий «тук» — только если человек уже взаимодействовал со страницей
  const ping = () => {
    try {
      audio.current = audio.current ?? new AudioContext();
      const ctx = audio.current, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.26);
    } catch {}
  };

  useEffect(() => {
    if (!me) return;
    loadChats();
    const ch = supabase.channel(`notify:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const m = payload.new as { id: string; chat_id: string; sender_id: string; text: string; kind: string };
        if (m.sender_id === me.id || m.kind === "system" || openRef.current === m.chat_id) return;
        const focus = me.focus_until && new Date(me.focus_until) > new Date();
        if (focus) return;
        if (!chats.current.has(m.chat_id)) await loadChats();
        const chat = chats.current.get(m.chat_id);
        if (!chat) return;
        let sender = names.current.get(m.sender_id);
        if (!sender) {
          const { data } = await supabase.from("profiles").select("display_name").eq("id", m.sender_id).maybeSingle();
          sender = (data?.display_name as string | undefined) ?? "Кто-то";
          names.current.set(m.sender_id, sender ?? "Кто-то");
        }
        const note: Note = { id: m.id, chat, sender: sender ?? "Кто-то", text: m.text, kind: m.kind, at: Date.now() };
        setNotes((n) => [note, ...n].slice(0, 3));
        ping();
        setTimeout(() => setNotes((n) => n.filter((x) => x.id !== note.id)), 6000);
        window.dispatchEvent(new Event("chats:refresh"));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, loadChats]);

  if (!notes.length) return null;
  return (
    <div className="notes" aria-live="polite">
      {notes.map((n) => (
        <button key={n.id} type="button" className={`note k-${n.chat.kind}`} onClick={() => { setNotes((x) => x.filter((y) => y.id !== n.id)); router.push(chatHref(n.chat.chat_id)); }}>
          <ChatAvatar c={n.chat} size={42} />
          <span className="note-text">
            <b>{chatTitle(n.chat)}</b>
            <small>
              {n.chat.kind !== "dm" && <em>{n.sender}: </em>}
              {n.kind === "sticker" ? "Стикер" : n.kind === "text" ? n.text : LABEL[n.kind] ?? "Сообщение"}
            </small>
          </span>
          {n.kind === "sticker" && <span className="note-sticker"><StickerArt code={n.text} size={40} /></span>}
          <i className="note-timer" />
        </button>
      ))}
    </div>
  );
}
