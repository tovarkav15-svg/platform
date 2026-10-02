"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { CHAT_MAX_BYTES, compressImage, kindOf, uploadChatFile } from "@/lib/upload";
import { Avatar, PresenceLabel } from "../Avatar";
import { ChatAvatar, chatTitle, SupportMark } from "./ChatAvatar";
import type { Member } from "./ChatSettings";
import { StickerPicker } from "./StickerPicker";
import { StickerArt } from "@/lib/stickers";
import { useSession } from "@/lib/session";
import { clock, dayLabel } from "./time";
import { FileMedia, ImageMedia, imageSize, VideoMedia, VoiceMedia, useVoiceRecorder, type MediaMeta } from "./ChatMedia";
import { readPrefs } from "@/lib/prefs";
import { MediaLibrary, ReportDialog } from "./ChatTools";
import { isOwner } from "@/lib/supabase";

type Kind = "text" | "image" | "video" | "voice" | "file" | "system" | "sticker";
type Msg = {
  id: string; text: string; sender_id: string; created_at: string;
  kind: Kind; media_path: string | null; media_meta: MediaMeta;
  edited_at?: string | null; deleted_at?: string | null;
  pending?: boolean; failed?: boolean; retry?: () => void;
};
type Other = { id: string; username: string; displayName: string; avatar: string | null; accent: string };

const FIELDS = "id, text, sender_id, created_at, kind, media_path, media_meta, edited_at, deleted_at";
const POLL_MS = 5000; // запасной опрос, основная доставка — Realtime
const MAX_LEN = 2000;

export function ChatThread({ chatId, meId, chat, onSettings, onCall }: { chatId: string; meId: string; chat: ChatListItem; onSettings: () => void; onCall: (video: boolean) => void }) {
  const other: Other = { id: chat.other_id ?? "", username: chat.other_username ?? "", displayName: chat.other_name ?? "", avatar: chat.other_avatar, accent: chat.other_accent ?? "edit" };
  const isDm = chat.kind === "dm";
  const multi = chat.kind === "group" || chat.kind === "support" || chat.kind === "channel";
  const canWrite = chat.kind !== "channel" || chat.my_role === "owner" || chat.my_role === "admin";
  const [people, setPeople] = useState<Map<string, Member>>(new Map());
  const { me } = useSession();
  const isAdmin = chat.my_role === "owner" || chat.my_role === "admin";
  const staffView = chat.kind === "support" && !!me?.is_support && chat.support_for !== meId;
  type Extra = { username: string | null; pinned_message: string | null; sign_posts: boolean; support_status: "open" | "resolved"; description: string };
  const [extra, setExtra] = useState<Extra | null>(null);
  const loadExtra = useCallback(async () => {
    const { data } = await supabase.from("chats").select("username, pinned_message, sign_posts, support_status, description").eq("id", chatId).maybeSingle();
    setExtra(data as Extra | null);
  }, [chatId]);
  useEffect(() => { loadExtra(); }, [loadExtra]);
  async function pin(id: string | null) {
    await supabase.from("chats").update({ pinned_message: id }).eq("id", chatId);
    loadExtra();
  }
  useEffect(() => {
    if (!multi) return;
    supabase.rpc("chat_people", { p_chat: chatId }).then(({ data }) => setPeople(new Map(((data as Member[]) ?? []).map((m) => [m.user_id, m]))));
  }, [chatId, multi, chat.member_count]);
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
  const [menu, setMenu] = useState<string | null>(null);      // id сообщения с открытым меню
  const [editing, setEditing] = useState<Msg | null>(null);
  const [library, setLibrary] = useState(false);
  const [report, setReport] = useState<{ user: string; message?: string | null; name: string } | null>(null);
  const [headMenu, setHeadMenu] = useState(false);
  const [block, setBlock] = useState<{ any: boolean; mine: boolean }>({ any: false, mine: false });
  const moderator = isOwner(me?.role);

  // Блокировка в личке: кто-то из двоих заблокировал другого
  const loadBlock = useCallback(async () => {
    if (!isDm || !other.id) return;
    const [{ data: any }, { data: mine }] = await Promise.all([
      supabase.rpc("is_blocked_pair", { a: meId, b: other.id }),
      supabase.from("blocks").select("blocked").eq("blocked", other.id).maybeSingle(),
    ]);
    setBlock({ any: !!any, mine: !!mine });
  }, [isDm, other.id, meId]);
  useEffect(() => { loadBlock(); }, [loadBlock]);
  async function toggleBlock() {
    setHeadMenu(false);
    if (block.mine) await supabase.from("blocks").delete().eq("blocked", other.id);
    else {
      if (!window.confirm(`Заблокировать ${other.displayName}? Он не сможет писать и звонить тебе.`)) return;
      await supabase.from("blocks").insert({ blocked: other.id });
    }
    loadBlock();
  }
  async function removeMsg(m: Msg) {
    setMenu(null);
    if (!window.confirm("Удалить сообщение у всех?")) return;
    const { error } = await supabase.rpc("delete_message", { p_id: m.id });
    if (error) return setNotice(error.message);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), text: "·", media_path: null, kind: "text" } : x)));
  }
  function startEdit(m: Msg) {
    setMenu(null);
    setEditing(m);
    setText(m.text);
    setTimeout(() => { input.current?.focus(); if (input.current) autosize(input.current); }, 0);
  }

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
    await supabase.rpc("mark_chat_read", { p_chat: chatId });
    window.dispatchEvent(new Event("chats:refresh"));
  }, [chatId, meId]);

  const loadReadState = useCallback(async () => {
    const { data } = await supabase.from("chat_members").select("last_read_at").eq("chat_id", chatId).neq("user_id", meId).order("last_read_at", { ascending: false }).limit(1);
    setOtherReadAt(data?.[0]?.last_read_at ?? null);
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
      // Изменили или удалили сообщение — обновляем на месте
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        const m = payload.new as Msg;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      // Собеседник прочитал — галочки обновляются сразу
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_members", filter: `chat_id=eq.${chatId}` }, (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string };
        if (row.user_id !== meId) setOtherReadAt((prev) => (!prev || row.last_read_at > prev ? row.last_read_at : prev));
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
        if (isDm && other.id) {
          const { data: p } = await supabase.from("profiles").select("focus_until").eq("id", other.id).maybeSingle();
          if (p?.focus_until && new Date(p.focus_until) > new Date())
            setNotice(`${other.displayName} в режиме фокуса до ${new Date(p.focus_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}. Сообщение можно будет отправить после.`);
        }
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

  const [stickers, setStickers] = useState(false);
  function sendSticker(code: string) {
    setStickers(false);
    return deliver(draft("sticker", code), async () => ({}));
  }

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
    if (editing) {
      const id = editing.id;
      setEditing(null);
      if (body === editing.text) return;
      setMessages((prev) => prev.map((x) => (x.id === id ? { ...x, text: body, edited_at: new Date().toISOString() } : x)));
      supabase.rpc("edit_message", { p_id: id, p_text: body }).then(({ error }) => { if (error) setNotice(error.message); });
      return;
    }
    sendText(body);
  }

  function pickFiles(files: FileList | File[] | null) {
    if (!files) return;
    setNotice("");
    Array.from(files).slice(0, 10).forEach((f) => sendFile(f));
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // Отправка по Enter или по Ctrl/⌘+Enter — как выбрано в Settings
    const send = readPrefs().enterSend ? !e.shiftKey : e.metaKey || e.ctrlKey;
    if (send) { e.preventDefault(); submit(); }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) { e.preventDefault(); pickFiles(files); }
  }

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }


  return (
    <div
      className={`thread ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files); }}
    >
      <header className={`thread-head k-${chat.kind}`}>
        <Link href="/messages/" className="back" aria-label="Назад к чатам">←</Link>
        {isDm ? (
          <Link href={profileHref(other.username)} className="thread-who">
            <Avatar name={other.displayName} avatar={other.avatar} accent={other.accent} size={40} userId={other.id} />
            <span><b>{other.displayName}</b><PresenceLabel userId={other.id} /></span>
          </Link>
        ) : (
          <button type="button" className="thread-who as-btn" onClick={onSettings}>
            <ChatAvatar c={chat} size={40} />
            <span>
              <b>{chatTitle(chat)}</b>
              <small className="thread-sub">
                {chat.kind === "support"
                  ? (staffView ? "Обращение пользователя · отвечает команда" : "Команда платформы: @fedonko, @awiny")
                  : `${extra?.username ? `@${extra.username} · ` : ""}${chat.member_count} ${chat.kind === "channel" ? "подписчиков" : "участников"}`}
              </small>
            </span>
          </button>
        )}
        {staffView && extra && (
          <button type="button" className={`ticket ${extra.support_status}`} onClick={async () => {
            await supabase.rpc("set_support_status", { p_chat: chatId, p_status: extra.support_status === "open" ? "resolved" : "open" });
            loadExtra();
          }}>{extra.support_status === "open" ? "● Открыто · отметить решённым" : "✓ Решено · открыть снова"}</button>
        )}
        <span className="thread-tools">
          {isDm && (
            <>
              <button type="button" className="icon-btn" onClick={() => onCall(false)} aria-label="Аудиозвонок" title="Аудиозвонок">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
              </button>
              <button type="button" className="icon-btn" onClick={() => onCall(true)} aria-label="Видеозвонок" title="Видеозвонок">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
              </button>
            </>
          )}
          <button type="button" className="icon-btn" onClick={() => setLibrary(true)} aria-label="Медиатека" title="Медиатека">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" /><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".55" /><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".55" /><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" /></svg>
          </button>
          {!isDm && <button type="button" className="icon-btn" onClick={onSettings} aria-label="Настройки чата" title="Настройки">⋯</button>}
          {isDm && (
            <span className="head-menu-anchor">
              <button type="button" className="icon-btn" onClick={() => setHeadMenu((v) => !v)} aria-label="Ещё" aria-expanded={headMenu}>⋯</button>
              {headMenu && (
                <div className="head-menu" role="menu" onMouseLeave={() => setHeadMenu(false)}>
                  <button type="button" role="menuitem" onClick={() => { setHeadMenu(false); setLibrary(true); }}>▦ Медиатека</button>
                  <Link role="menuitem" href={profileHref(other.username)}>☺ Профиль</Link>
                  <button type="button" role="menuitem" onClick={() => { setHeadMenu(false); setReport({ user: other.id, name: other.displayName }); }}>⚑ Пожаловаться</button>
                  <button type="button" role="menuitem" className="danger" onClick={toggleBlock}>{block.mine ? "↺ Разблокировать" : "⊘ Заблокировать"}</button>
                </div>
              )}
            </span>
          )}
        </span>
      </header>

      {extra?.pinned_message && (() => {
        const pm = messages.find((x) => x.id === extra.pinned_message);
        return (
          <div className="pinned-bar">
            <i>📌</i>
            <button type="button" className="pinned-text" onClick={() => document.getElementById(`m-${extra.pinned_message}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <b>Закреплено</b><span>{pm ? (pm.kind === "text" ? pm.text : pm.kind === "sticker" ? "Стикер" : "Вложение") : "Сообщение"}</span>
            </button>
            {isAdmin && chat.kind !== "dm" && <button type="button" className="icon-btn sm" onClick={() => pin(null)} aria-label="Открепить">×</button>}
          </div>
        );
      })()}
      <div className="msgs" ref={scroller} onScroll={onScroll}>
        {!loaded && <div className="msgs-loading"><span /><span /><span /></div>}
        {loaded && chat.kind === "support" && !messages.some((m) => m.kind !== "system") && (
          <div className="support-hello">
            <span className="support-hello-mark"><SupportMark /></span>
            <b>Чем помочь?</b>
            <p className="lead">Опиши ситуацию, команда ответит здесь. Можно приложить скриншот.</p>
            <div className="support-topics">
              {["Что-то не работает", "Предложить идею", "Вопрос по профилю", "Пожаловаться на пользователя"].map((t) => (
                <button key={t} type="button" className="chip-btn" onClick={() => { setText(t + ": "); input.current?.focus(); }}>{t}</button>
              ))}
            </div>
          </div>
        )}
        {loaded && !messages.length && chat.kind !== "support" && (
          <div className="msgs-empty">
            {isDm ? <Avatar name={other.displayName} avatar={other.avatar} accent={other.accent} size={72} /> : <ChatAvatar c={chat} size={72} />}
            <b>{isDm ? `Начни разговор с ${other.displayName}` : chatTitle(chat)}</b>
            <p className="lead">{canWrite ? "Напиши, запиши голосовое или пришли фото." : "Здесь пока нет постов."}</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
          const mine = m.sender_id === meId;
          const groupEnd = !next || next.sender_id !== m.sender_id || dayLabel(next.created_at) !== dayLabel(m.created_at);
          const read = mine && !m.pending && !m.failed && !!otherReadAt && new Date(otherReadAt).getTime() >= new Date(m.created_at).getTime();
          const visual = m.kind === "image" || m.kind === "video";
          const canEdit = mine && m.kind === "text" && !m.deleted_at && !m.pending && Date.now() - new Date(m.created_at).getTime() < 48 * 3600 * 1000;
          const canDelete = !m.deleted_at && !m.pending && (mine || moderator || (isAdmin && chat.kind !== "dm" && chat.kind !== "support"));
          if (m.kind === "system") return (
            <div key={m.id} className="msg-wrap">
              {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
              <div className="msg-system">{m.text}</div>
            </div>
          );
          const author = multi && !mine && !(chat.kind === "channel" && extra && !extra.sign_posts) ? people.get(m.sender_id) : undefined;
          const groupStart = !prev || prev.sender_id !== m.sender_id || prev.kind === "system" || newDay;
          return (
            <div key={m.id} id={`m-${m.id}`} className={`msg-wrap ${author ? "with-author" : ""} ${extra?.pinned_message === m.id ? "is-pinned" : ""}`}>
              {newDay && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
              {author && groupStart && (
                <Link href={profileHref(author.username)} className="msg-author">
                  <Avatar name={author.display_name} avatar={author.avatar} accent={author.accent} size={22} userId={author.user_id} />
                  <b>{author.display_name}</b>
                  {chat.kind === "support" && author.role === "admin" && <em className="em-support">поддержка</em>}
                  {chat.kind !== "support" && author.role !== "member" && <em>{author.role === "owner" ? "владелец" : "админ"}</em>}
                </Link>
              )}
              <div className={`msg kind-${m.kind} ${(visual && !m.text) || m.kind === "sticker" ? "bare" : ""} ${mine ? "mine" : ""} ${groupEnd ? "end" : ""} ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
                {m.deleted_at ? <span className="msg-deleted">Сообщение удалено</span> : (
                  <>
                    {m.kind === "image" && <ImageMedia path={m.media_path} meta={m.media_meta} />}
                    {m.kind === "video" && <VideoMedia path={m.media_path} meta={m.media_meta} />}
                    {m.kind === "file" && <FileMedia path={m.media_path} meta={m.media_meta} />}
                    {m.kind === "voice" && <VoiceMedia path={m.media_path} meta={m.media_meta} mine={mine} />}
                    {m.kind === "sticker" && <span className="msg-sticker"><StickerArt code={m.text} size={140} /></span>}
                    {m.text && m.kind !== "sticker" && <span className="msg-text">{m.text}</span>}
                  </>
                )}
                <span className="msg-meta">
                  {m.edited_at && !m.deleted_at && <em className="msg-edited">изм.</em>}
                  {m.pending && m.kind !== "text" ? "загружаю…" : clock(m.created_at)}
                  {mine && <Ticks state={m.failed ? "failed" : m.pending ? "pending" : read ? "read" : "sent"} />}
                </span>
                {!m.deleted_at && !m.pending && !m.failed && (
                  <span className={`msg-more-anchor ${mine ? "mine" : ""}`}>
                    <button type="button" className="msg-more" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label="Действия с сообщением">⋯</button>
                    {menu === m.id && (
                      <div className="msg-menu" role="menu" onMouseLeave={() => setMenu(null)}>
                        {m.kind === "text" && <button type="button" role="menuitem" onClick={() => { navigator.clipboard?.writeText(m.text); setMenu(null); }}>⧉ Копировать</button>}
                        {canEdit && <button type="button" role="menuitem" onClick={() => startEdit(m)}>✎ Изменить</button>}
                        {!mine && <button type="button" role="menuitem" onClick={() => { setMenu(null); setReport({ user: m.sender_id, message: m.id, name: people.get(m.sender_id)?.display_name ?? other.displayName }); }}>⚑ Пожаловаться</button>}
                        {canDelete && <button type="button" role="menuitem" className="danger" onClick={() => removeMsg(m)}>🗑 Удалить</button>}
                      </div>
                    )}
                  </span>
                )}

              </div>
              {isAdmin && chat.kind !== "dm" && chat.kind !== "support" && !m.pending && !m.failed && extra?.pinned_message !== m.id && (
                <button type="button" className={`pin-btn ${mine ? "mine" : ""}`} onClick={() => pin(m.id)} aria-label="Закрепить">📌</button>
              )}
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

      {isDm && block.any ? (
        <div className="composer readonly">
          <span>{block.mine ? `Ты заблокировал ${other.displayName}. Он не может писать и звонить тебе.` : "Переписка недоступна."}</span>
          {block.mine && <button type="button" className="chip-btn" onClick={toggleBlock}>Разблокировать</button>}
        </div>
      ) : !canWrite ? (
        <div className="composer readonly">
          <span>Ты подписан на канал. Писать здесь могут только админы.</span>
          <button type="button" className="chip-btn" onClick={onSettings}>О канале</button>
        </div>
      ) : voice.state === "recording" ? (
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
        <>
        {editing && (
          <div className="edit-bar">
            <i>✎</i><span><b>Редактирование</b><small>{editing.text}</small></span>
            <button type="button" className="icon-btn sm" aria-label="Отменить" onClick={() => { setEditing(null); setText(""); }}>×</button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <span className="stk-anchor">
            <button type="button" className={`attach stk-btn ${stickers ? "on" : ""}`} onClick={() => setStickers((v) => !v)} aria-label="Стикеры" title="Стикеры">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="10" r="1.3" fill="currentColor" /><circle cx="15" cy="10" r="1.3" fill="currentColor" /><path d="M8 14.5q4 3.5 8 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
            {stickers && <StickerPicker onPick={sendSticker} onClose={() => setStickers(false)} />}
          </span>
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
        </>
      )}
      <MediaLibrary chatId={chatId} open={library} onClose={() => setLibrary(false)} meId={meId} />
      <ReportDialog target={report?.user ?? null} messageId={report?.message} name={report?.name ?? ""} onClose={() => setReport(null)} />
    </div>
  );
}

/** Галочки: часики — отправляется, ✓ — доставлено, ✓✓ синие — прочитано */
function Ticks({ state }: { state: "pending" | "sent" | "read" | "failed" }) {
  const label = { pending: "Отправляется", sent: "Доставлено", read: "Прочитано", failed: "Не отправилось" }[state];
  return (
    <span className={`ticks t-${state}`} role="img" aria-label={label} title={label}>
      {state === "pending" ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 4.5V8l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      ) : state === "failed" ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor" /><path d="M8 4.2v4.6M8 11v.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
      ) : (
        <svg viewBox="0 0 20 12" width="19" height="12" aria-hidden="true">
          <path className="tk1" d="M1.5 6.5l3.2 3.2L11 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path className="tk2" d="M8.4 9.7L15.2 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
