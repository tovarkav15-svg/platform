"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "../../Avatar";
import { clock, dayLabel } from "../time";

type Msg = { id: string; text: string; senderId: string; at: string; pending?: boolean; failed?: boolean };
type Other = { username: string; displayName: string; avatar: string | null; accent: string };

const POLL_MS = 2000;
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
      const next = [...prev, ...incoming.filter((m) => !ids.has(m.id))];
      return next;
    });
    lastAt.current = incoming[incoming.length - 1].at;
  }, []);

  // Загрузка и опрос новых сообщений
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const qs = lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
        const r = await fetch(`/api/chats/${chatId}/messages${qs}`, { cache: "no-store" });
        if (!r.ok || !alive) return;
        const d = await r.json();
        merge(d.messages);
        setOtherReadAt(d.otherReadAt);
        setLoaded(true);
        if (d.messages.length) window.dispatchEvent(new Event("chats:refresh"));
      } catch {}
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [chatId, merge]);

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
    const temp: Msg = { id: tempId, text: body, senderId: meId, at: new Date().toISOString(), pending: true };
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? temp : m)) : [...prev, temp]));
    stick.current = true;
    try {
      const r = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      if (!r.ok) throw new Error();
      const { message } = await r.json();
      // Заменяем черновик настоящим сообщением (опрос мог уже его принести)
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        return without.some((m) => m.id === message.id) ? without : [...without, message];
      });
      lastAt.current = message.at;
      window.dispatchEvent(new Event("chats:refresh"));
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    }
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

  const lastMine = [...messages].reverse().find((m) => m.senderId === meId && !m.pending && !m.failed);

  return (
    <div className="thread">
      <header className="thread-head">
        <Link href="/messages" className="back" aria-label="Назад к чатам">←</Link>
        <Link href={`/u/${other.username}`} className="thread-who">
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
          const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
          const mine = m.senderId === meId;
          const groupEnd = !next || next.senderId !== m.senderId || dayLabel(next.at) !== dayLabel(m.at);
          const read = mine && lastMine?.id === m.id && otherReadAt && otherReadAt >= m.at;
          return (
            <div key={m.id} className="msg-wrap">
              {newDay && <div className="day-sep"><span>{dayLabel(m.at)}</span></div>}
              <div className={`msg ${mine ? "mine" : ""} ${groupEnd ? "end" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
                <span className="msg-text">{m.text}</span>
                <span className="msg-meta">
                  {clock(m.at)}
                  {mine && !m.pending && !m.failed && <span className={`ticks ${read ? "read" : ""}`} aria-label={read ? "Прочитано" : "Доставлено"}>{read ? "✓✓" : "✓"}</span>}
                </span>
              </div>
              {m.failed && (
                <button className="retry" type="button" onClick={() => send(m.text, m.id)}>Не отправилось · повторить</button>
              )}
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
