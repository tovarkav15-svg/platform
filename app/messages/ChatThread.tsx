"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { Avatar } from "../Avatar";
import { clock, dayLabel } from "./time";

type Msg = { id: string; text: string; sender_id: string; created_at: string; pending?: boolean; failed?: boolean };
type Other = { username: string; displayName: string; avatar: string | null; accent: string };

const POLL_MS = 5000; // запасной опрос, основная доставка — Realtime
const MAX_LEN = 2000;

export function ChatThread({ chatId, meId, other }: { chatId: string; meId: string; other: Other }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true); // держим ленту внизу, пока человек сам не прокрутил вверх
  const lastAt = useRef<string | null>(null);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !ids.has(m.id))].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    const newest = incoming[incoming.length - 1].created_at;
    if (!lastAt.current || newest > lastAt.current) lastAt.current = newest;
  }, []);

  const markRead = useCallback(async () => {
    await supabase.from("chat_members").update({ last_read_at: new Date().toISOString() }).eq("chat_id", chatId).eq("user_id", meId);
    window.dispatchEvent(new Event("chats:refresh"));
  }, [chatId, meId]);

  const loadReadState = useCallback(async () => {
    const { data } = await supabase.from("chat_members").select("last_read_at").eq("chat_id", chatId).neq("user_id", meId).maybeSingle();
    setOtherReadAt(data?.last_read_at ?? null);
  }, [chatId, meId]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      let q = supabase.from("messages").select("id, text, sender_id, created_at").eq("chat_id", chatId);
      q = lastAt.current ? q.gt("created_at", lastAt.current).order("created_at") : q.order("created_at", { ascending: false }).limit(100);
      const { data } = await q;
      if (!alive || !data) return;
      const list = (lastAt.current ? data : [...data].reverse()) as Msg[];
      merge(list);
      setLoaded(true);
      if (list.some((m) => m.sender_id !== meId)) markRead();
      loadReadState();
    };

    load();
    markRead();

    // Новые сообщения приходят сразу
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        const m = payload.new as Msg;
        merge([m]);
        if (m.sender_id !== meId && !document.hidden) markRead();
      })
      .subscribe();

    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) { load(); markRead(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [chatId, meId, merge, markRead, loadReadState]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: loaded ? "smooth" : "auto" });
  }, [messages, loaded]);

  useEffect(() => { input.current?.focus(); }, []);

  function onScroll() {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function send(body: string, retryId?: string) {
    const tempId = retryId ?? `tmp-${Date.now()}`;
    const temp: Msg = { id: tempId, text: body, sender_id: meId, created_at: new Date().toISOString(), pending: true };
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? temp : m)) : [...prev, temp]));
    stick.current = true;
    const { data, error } = await supabase
      .from("messages")
      .insert({ chat_id: chatId, sender_id: meId, text: body })
      .select("id, text, sender_id, created_at")
      .single();
    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      return;
    }
    // Заменяем черновик настоящим сообщением (Realtime мог уже его принести)
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== tempId);
      return without.some((m) => m.id === data.id) ? without : [...without, data as Msg];
    });
    if (!lastAt.current || data.created_at > lastAt.current) lastAt.current = data.created_at;
    window.dispatchEvent(new Event("chats:refresh"));
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || body.length > MAX_LEN) return;
    setText("");
    if (input.current) input.current.style.height = "";
    send(body);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const lastMine = [...messages].reverse().find((m) => m.sender_id === meId && !m.pending && !m.failed);

  return (
    <div className="thread">
      <header className="thread-head">
        <Link href="/messages/" className="back" aria-label="Назад к чатам">←</Link>
        <Link href={profileHref(other.username)} className="thread-who">
          <Avatar name={other.displayName} avatar={other.avatar} accent={other.accent} size={40} />
          <span><b>{other.displayName}</b><small>@{other.username}</small></span>
        </Link>
      </header>

      <div className="msgs" ref={scroller} onScroll={onScroll}>
        {!loaded && <div className="msgs-loading"><span /><span /><span /></div>}
        {loaded && !messages.length && (
          <div className="msgs-empty">
            <Avatar name={other.displayName} avatar={other.avatar} accent={other.accent} size={72} />
            <b>Начни разговор с {other.displayName}</b>
            <p className="lead">Напиши первое сообщение, оно придёт сразу.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const mine = m.sender_id === meId;
          const groupEnd = !next || next.sender_id !== m.sender_id || dayLabel(next.created_at) !== dayLabel(m.created_at);
          const read = mine && lastMine?.id === m.id && !!otherReadAt && new Date(otherReadAt) >= new Date(m.created_at);
          return (
            <div key={m.id} className="msg-wrap">
              {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
              <div className={`msg ${mine ? "mine" : ""} ${groupEnd ? "end" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
                <span className="msg-text">{m.text}</span>
                <span className="msg-meta">
                  {clock(m.created_at)}
                  {mine && !m.pending && !m.failed && <span className={`ticks ${read ? "read" : ""}`} aria-label={read ? "Прочитано" : "Доставлено"}>{read ? "✓✓" : "✓"}</span>}
                </span>
              </div>
              {m.failed && <button className="retry" type="button" onClick={() => send(m.text, m.id)}>Не отправилось · повторить</button>}
            </div>
          );
        })}
      </div>

      <form className="composer" onSubmit={submit}>
        <textarea
          ref={input}
          id="messageInput"
          rows={1}
          value={text}
          maxLength={MAX_LEN}
          placeholder="Сообщение"
          onChange={(e) => { setText(e.target.value); autosize(e.target); }}
          onKeyDown={onKey}
        />
        <button className="send" type="submit" disabled={!text.trim()} aria-label="Отправить">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" /></svg>
        </button>
      </form>
    </div>
  );
}
