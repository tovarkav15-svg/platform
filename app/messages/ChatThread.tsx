"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { CHAT_MAX_BYTES, compressImage, kindOf, uploadChatFile } from "@/lib/upload";
import { Avatar } from "../Avatar";
import { clock, dayLabel } from "./time";
import { FileMedia, ImageMedia, imageSize, VideoMedia, VoiceMedia, useVoiceRecorder, type MediaMeta } from "./ChatMedia";

type Kind = "text" | "image" | "video" | "voice" | "file";
type Msg = {
  id: string; text: string; sender_id: string; created_at: string;
  kind: Kind; media_path: string | null; media_meta: MediaMeta;
  pending?: boolean; failed?: boolean; retry?: () => void;
};
type Other = { username: string; displayName: string; avatar: string | null; accent: string };

const FIELDS = "id, text, sender_id, created_at, kind, media_path, media_meta";
const POLL_MS = 5000; // запасной опрос, основная доставка — Realtime
const MAX_LEN = 2000;

export function ChatThread({ chatId, meId, other }: { chatId: string; meId: string; other: Other }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
      let q = supabase.from("messages").select(FIELDS).eq("chat_id", chatId);
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

  // Общая отправка: черновик сразу в ленте, потом загрузка файла и запись в базу
  async function deliver(temp: Msg, prepare: () => Promise<Partial<Msg>>) {
    const tempId = temp.id;
    const attempt = async () => {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
      try {
        const extra = await prepare();
        const { data, error } = await supabase
          .from("messages")
          .insert({ chat_id: chatId, sender_id: meId, text: temp.text, kind: temp.kind, media_path: extra.media_path ?? null, media_meta: { ...temp.media_meta, local: undefined, ...extra.media_meta } })
          .select(FIELDS)
          .single();
        if (error || !data) throw error;
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== tempId);
          return without.some((m) => m.id === data.id) ? without : [...without, data as Msg];
        });
        if (!lastAt.current || data.created_at > lastAt.current) lastAt.current = data.created_at;
        window.dispatchEvent(new Event("chats:refresh"));
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, retry: attempt } : m)));
      }
    };
    stick.current = true;
    setMessages((prev) => [...prev, { ...temp, pending: true }]);
    await attempt();
  }

  const draft = (kind: Kind, body: string, meta: MediaMeta = {}): Msg => ({
    id: `tmp-${crypto.randomUUID()}`, text: body, sender_id: meId, created_at: new Date().toISOString(),
    kind, media_path: null, media_meta: meta,
  });

  function sendText(body: string) {
    return deliver(draft("text", body), async () => ({}));
  }

  async function sendFile(file: File, caption = "") {
    if (file.size > CHAT_MAX_BYTES) return setNotice(`Файл «${file.name}» больше 50 МБ`);
    const kind = kindOf(file);
    let blob: Blob = file;
    const meta: MediaMeta = { name: file.name, size: file.size, local: URL.createObjectURL(file) };
    if (kind === "image") {
      blob = await compressImage(file, 2000, 0.86).catch(() => file);
      Object.assign(meta, await imageSize(blob), { size: blob.size });
    }
    const name = kind === "image" && blob !== file ? file.name.replace(/\.\w+$/, "") + ".jpg" : file.name;
    return deliver(draft(kind, caption, meta), async () => ({
      media_path: await uploadChatFile(chatId, blob, name),
    }));
  }

  function sendVoice(blob: Blob, duration: number) {
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const meta: MediaMeta = { duration, size: blob.size, local: URL.createObjectURL(blob) };
    return deliver(draft("voice", "", meta), async () => ({ media_path: await uploadChatFile(chatId, blob, `voice.${ext}`) }));
  }

  const voice = useVoiceRecorder(sendVoice);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || body.length > MAX_LEN) return;
    setText("");
    if (input.current) input.current.style.height = "";
    sendText(body);
  }

  function pickFiles(files: FileList | File[] | null) {
    if (!files) return;
    setNotice("");
    Array.from(files).slice(0, 10).forEach((f) => sendFile(f));
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); pickFiles(files); }
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const lastMine = [...messages].reverse().find((m) => m.sender_id === meId && !m.pending && !m.failed);

  return (
    <div
      className={`thread ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files); }}
    >
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
            <p className="lead">Напиши, запиши голосовое или пришли фото.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const mine = m.sender_id === meId;
          const groupEnd = !next || next.sender_id !== m.sender_id || dayLabel(next.created_at) !== dayLabel(m.created_at);
          const read = mine && lastMine?.id === m.id && !!otherReadAt && new Date(otherReadAt) >= new Date(m.created_at);
          const visual = m.kind === "image" || m.kind === "video";
          return (
            <div key={m.id} className="msg-wrap">
              {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
              <div className={`msg kind-${m.kind} ${visual && !m.text ? "bare" : ""} ${mine ? "mine" : ""} ${groupEnd ? "end" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
                {m.kind === "image" && <ImageMedia path={m.media_path} meta={m.media_meta} />}
                {m.kind === "video" && <VideoMedia path={m.media_path} meta={m.media_meta} />}
                {m.kind === "file" && <FileMedia path={m.media_path} meta={m.media_meta} />}
                {m.kind === "voice" && <VoiceMedia path={m.media_path} meta={m.media_meta} mine={mine} />}
                {m.text && <span className="msg-text">{m.text}</span>}
                <span className="msg-meta">
                  {m.pending && m.kind !== "text" ? "загружаю…" : clock(m.created_at)}
                  {mine && !m.pending && !m.failed && <span className={`ticks ${read ? "read" : ""}`} aria-label={read ? "Прочитано" : "Доставлено"}>{read ? "✓✓" : "✓"}</span>}
                </span>
              </div>
              {m.failed && <button className="retry" type="button" onClick={() => m.retry?.()}>Не отправилось · повторить</button>}
            </div>
          );
        })}
      </div>

      {dragging && <div className="drop-hint">Отпусти, чтобы отправить</div>}
      {(notice || voice.state === "denied") && (
        <div className="chat-notice" role="status">
          {voice.state === "denied" ? "Нет доступа к микрофону. Разреши его в настройках браузера." : notice}
          <button type="button" className="icon-btn sm" onClick={() => setNotice("")} aria-label="Скрыть">×</button>
        </div>
      )}

      {voice.state === "recording" ? (
        <div className="composer recording">
          <button type="button" className="icon-btn" onClick={voice.cancel} aria-label="Отменить запись">×</button>
          <span className="rec-dot" />
          <span className="rec-time">{voice.label}</span>
          <span className="rec-hint">Идёт запись голосового</span>
          <button type="button" className="send" onClick={voice.stop} aria-label="Отправить голосовое">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" /></svg>
          </button>
        </div>
      ) : (
        <form className="composer" onSubmit={submit}>
          <button type="button" className="attach" onClick={() => fileInput.current?.click()} aria-label="Прикрепить фото, видео или файл" title="Фото, видео, файл">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10z" /></svg>
          </button>
          <input ref={fileInput} type="file" multiple hidden
            accept="image/*,video/*,audio/*,application/pdf,application/zip,.doc,.docx,.txt"
            onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
          <textarea
            ref={input}
            id="messageInput"
            rows={1}
            value={text}
            maxLength={MAX_LEN}
            placeholder="Сообщение"
            onChange={(e) => { setText(e.target.value); autosize(e.target); }}
            onKeyDown={onKey}
            onPaste={onPaste}
          />
          {text.trim() ? (
            <button className="send" type="submit" aria-label="Отправить">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor" /></svg>
            </button>
          ) : (
            <button className="send mic" type="button" onClick={voice.start} aria-label="Записать голосовое" title="Голосовое">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" /></svg>
            </button>
          )}
        </form>
      )}
    </div>
  );
}
