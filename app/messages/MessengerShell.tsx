"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { chatHref } from "@/lib/links";
import { shortTime } from "./time";
import { ChatAvatar, chatTitle } from "./ChatAvatar";
import { CreateChat } from "./CreateChat";
import { ChannelsBrowser } from "./ChannelsBrowser";
import { useSession } from "@/lib/session";
import { ChatPeek } from "./ChatPeek";

const KIND_LABEL: Record<string, string> = { image: "Фото", video: "Видео", voice: "Голосовое сообщение", file: "Файл", sticker: "Стикер" };
type Filter = "all" | "dm" | "group" | "channel" | "tickets";

type Props = { chats: ChatListItem[] | null; activeId: string | null; meId: string; children: React.ReactNode; onChanged: () => void };

export function MessengerShell({ chats, activeId, meId, children, onChanged }: Props) {
  const router = useRouter();
  const { me } = useSession();
  const staff = !!me?.is_support;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [menu, setMenu] = useState(false);
  const [create, setCreate] = useState<"group" | "channel" | null>(null);
  // Переход из задания AURA: сразу открываем создание канала
  const wantNew = useSearchParams().get("new");
  useEffect(() => { if (wantNew === "channel" || wantNew === "group") setCreate(wantNew); }, [wantNew]);
  const [browse, setBrowse] = useState(false);
  // Быстрый просмотр: долгое нажатие на телефоне, правый клик на компьютере
  const [peek, setPeek] = useState<ChatListItem | null>(null);
  const press = useRef<{ t?: ReturnType<typeof setTimeout>; fired: boolean; x: number; y: number }>({ fired: false, x: 0, y: 0 });
  const startPress = (c: ChatListItem, e: React.TouchEvent) => {
    const p = press.current; p.fired = false; p.x = e.touches[0].clientX; p.y = e.touches[0].clientY;
    clearTimeout(p.t);
    p.t = setTimeout(() => { p.fired = true; navigator.vibrate?.(12); setPeek(c); }, 420);
  };
  const movePress = (e: React.TouchEvent) => {
    const p = press.current;
    if (Math.hypot(e.touches[0].clientX - p.x, e.touches[0].clientY - p.y) > 10) clearTimeout(p.t);
  };
  const endPress = () => clearTimeout(press.current.t);

  const list = useMemo(() => chats ?? [], [chats]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const isTicket = (c: ChatListItem) => c.kind === "support" && c.support_for !== meId;
    // Обращения людей в поддержку — только во вкладке «Обращения», не в общем списке
    return list.filter((c) => ((filter === "all" && !isTicket(c)) || (filter === "tickets" ? isTicket(c) : c.kind === filter || (filter === "dm" && c.kind === "support" && !isTicket(c))))
      && (!s || chatTitle(c).toLowerCase().includes(s) || (c.other_username ?? "").includes(s)));
  }, [list, q, filter]);
  const hasSupport = list.some((c) => c.kind === "support" && c.support_for === meId);
  // Непрочитанные по папкам — как счётчики у вкладок в Telegram
  const unreadIn = (k: Filter) => list.filter((c) => c.unread > 0 && (k === "all" ? !(c.kind === "support" && c.support_for !== meId)
    : k === "tickets" ? c.kind === "support" && c.support_for !== meId : k === "dm" ? c.kind === "dm" || (c.kind === "support" && c.support_for === meId) : c.kind === k)).length;
  const totalUnread = unreadIn("all");

  async function openSupport() {
    const { data } = await supabase.rpc("open_support");
    if (data) { onChanged(); router.push(chatHref(data as string)); }
  }

  const preview = (c: ChatListItem) => {
    if (!c.last_at) return "Нет сообщений";
    const body = (c.last_kind === "sticker" ? "" : c.last_text) || KIND_LABEL[c.last_kind ?? ""] || "Сообщение";
    if (c.last_kind === "system") return body;
    if (c.last_mine) return body;
    return (c.kind === "group" || c.kind === "support") && c.last_sender ? `${c.last_sender}: ${body}` : body;
  };

  return (
    <div className="messenger" data-open={activeId ? "chat" : "list"}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h1 className="caps">Чаты{totalUnread > 0 && <small className="chat-list-unread">{totalUnread} {totalUnread % 10 === 1 && totalUnread % 100 !== 11 ? "новый" : "новых"}</small>}</h1>
          <div className="new-menu">
            <button type="button" className="new-chat-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Новый чат" title="Новый чат">
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>
            {menu && (
              <div className="new-menu-pop" onMouseLeave={() => setMenu(false)}>
                <Link href="/community/?tab=people" onClick={() => setMenu(false)}><i>✉</i><span><b>Личный чат</b><small>Найди человека</small></span></Link>
                <button type="button" onClick={() => { setCreate("group"); setMenu(false); }}><i>◍</i><span><b>Группа</b><small>Пишут все участники</small></span></button>
                <button type="button" onClick={() => { setCreate("channel"); setMenu(false); }}><i>◈</i><span><b>Канал</b><small>Пишут админы, читают подписчики</small></span></button>
                <button type="button" onClick={() => { setBrowse(true); setMenu(false); }}><i>⌕</i><span><b>Найти канал</b><small>Открытые каналы платформы</small></span></button>
              </div>
            )}
          </div>
        </div>
        <label className="chat-search2">
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input id="chatSearch" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} placeholder="Поиск" autoComplete="off" aria-label="Поиск по чатам" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Очистить поиск">×</button>}
        </label>
        <div className="chat-filters" role="tablist" aria-label="Виды чатов">
          {([["all", "Все"], ["dm", "Личные"], ["group", "Группы"], ["channel", "Каналы"], ...(staff ? [["tickets", "Обращения"]] : [])] as [Filter, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={k === "tickets" ? "tickets" : ""} onClick={() => setFilter(k)}>
              {l}{unreadIn(k) > 0 && <em>{unreadIn(k)}</em>}
            </button>
          ))}
        </div>
        <ul>
          {!hasSupport && chats && (
            <li>
              <button type="button" className="chat-item support-cta" onClick={openSupport}>
                <ChatAvatar c={{ kind: "support", avatar: null, accent: "brand", emoji: "", title: "Поддержка", other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
                <span className="chat-item-text"><span className="row"><b>Поддержка</b><span className="kind-tag support">команда</span></span><span className="row"><small>Вопрос, баг или идея: напиши команде</small></span></span>
              </button>
            </li>
          )}
          {shown.map((c, i) => (
            <li key={c.chat_id} style={{ "--i": i } as React.CSSProperties}>
              <Link href={chatHref(c.chat_id)} className={`chat-item k-${c.kind} ${c.unread > 0 ? "has-unread" : ""}`} aria-current={activeId === c.chat_id ? "page" : undefined}
                title="Правый клик — быстрый просмотр"
                onContextMenu={(e) => { e.preventDefault(); setPeek(c); }}
                onTouchStart={(e) => startPress(c, e)} onTouchMove={movePress} onTouchEnd={endPress} onTouchCancel={endPress}
                onClick={(e) => { if (press.current.fired) { e.preventDefault(); press.current.fired = false; } }}>
                <ChatAvatar c={c} />
                <span className="chat-item-text">
                  <span className="row">
                    <b>{chatTitle(c)}</b>
                    {c.kind === "support" && <span className="kind-tag support">команда</span>}
                    {c.kind === "channel" && <span className="kind-tag">канал</span>}
                    {c.kind === "group" && <span className="kind-tag">{c.member_count}</span>}
                    {c.last_at && <time>{shortTime(c.last_at)}</time>}
                  </span>
                  <span className="row">
                    <small>{c.last_mine && c.last_kind !== "system" && <svg className="ci-tick" viewBox="0 0 20 12" width="16" height="10" aria-hidden="true"><path d="M1.5 6.5l3.2 3.2L11 3M8.4 9.7L15.2 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}{preview(c)}</small>
                    {c.unread > 0 && <span className="count-badge">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {chats && !list.length && (
          <div className="chat-list-empty">
            <p className="lead">Чатов пока нет. Найди людей, создай группу или канал.</p>
            <Link className="btn sm" href="/community/?tab=people">Найти людей</Link>
          </div>
        )}
        {chats && list.length > 0 && !shown.length && <p className="chat-list-empty lead">Ничего не нашлось.</p>}
      </aside>
      <section className="chat-pane">{children}</section>

      <CreateChat kind={create} onClose={() => setCreate(null)} meId={meId}
        onCreated={(id) => { setCreate(null); onChanged(); router.push(chatHref(id)); }} />
      {peek && (
        <ChatPeek chat={peek} meId={meId} onClose={() => setPeek(null)}
          onOpen={() => { const id = peek.chat_id; setPeek(null); router.push(chatHref(id)); }}
          onRead={async () => { await supabase.rpc("mark_chat_read", { p_chat: peek.chat_id }); setPeek(null); onChanged(); window.dispatchEvent(new Event("chats:refresh")); }} />
      )}
      <ChannelsBrowser open={browse} onClose={() => setBrowse(false)} onJoined={(id) => { setBrowse(false); onChanged(); router.push(chatHref(id)); }} />
    </div>
  );
}
