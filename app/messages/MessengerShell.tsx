"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { chatHref } from "@/lib/links";
import { shortTime } from "./time";
import { ChatAvatar, chatTitle } from "./ChatAvatar";
import { CreateChat } from "./CreateChat";
import { ChannelsBrowser } from "./ChannelsBrowser";
import { useSession } from "@/lib/session";

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

  const list = useMemo(() => chats ?? [], [chats]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const isTicket = (c: ChatListItem) => c.kind === "support" && c.support_for !== meId;
    return list.filter((c) => (filter === "all" || (filter === "tickets" ? isTicket(c) : c.kind === filter || (filter === "dm" && c.kind === "support" && !isTicket(c))))
      && (!s || chatTitle(c).toLowerCase().includes(s) || (c.other_username ?? "").includes(s)));
  }, [list, q, filter]);
  const hasSupport = list.some((c) => c.kind === "support" && c.support_for === meId);

  async function openSupport() {
    const { data } = await supabase.rpc("open_support");
    if (data) { onChanged(); router.push(chatHref(data as string)); }
  }

  const preview = (c: ChatListItem) => {
    if (!c.last_at) return "Нет сообщений";
    const body = (c.last_kind === "sticker" ? "" : c.last_text) || KIND_LABEL[c.last_kind ?? ""] || "Сообщение";
    if (c.last_kind === "system") return body;
    if (c.last_mine) return `Ты: ${body}`;
    return c.kind === "group" || c.kind === "support" ? `${c.last_sender ?? ""}: ${body}` : body;
  };

  return (
    <div className="messenger" data-open={activeId ? "chat" : "list"}>
      <aside className="chat-list">
        <div className="chat-list-head">
          <h1 className="caps">Чаты</h1>
          <div className="new-menu">
            <button type="button" className="btn sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>+ Новый</button>
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
        <div className="input chat-search">
          <input id="chatSearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по чатам" autoComplete="off" />
        </div>
        <div className="chat-filters" role="tablist" aria-label="Виды чатов">
          {([["all", "Все"], ["dm", "Личные"], ["group", "Группы"], ["channel", "Каналы"], ...(staff ? [["tickets", "Обращения"]] : [])] as [Filter, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={k === "tickets" ? "tickets" : ""} onClick={() => setFilter(k)}>
              {l}{k === "tickets" && <em>{list.filter((c) => c.kind === "support" && c.support_for !== meId && c.unread > 0).length || ""}</em>}
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
              <Link href={chatHref(c.chat_id)} className={`chat-item k-${c.kind}`} aria-current={activeId === c.chat_id ? "page" : undefined}>
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
                    <small>{preview(c)}</small>
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
      <ChannelsBrowser open={browse} onClose={() => setBrowse(false)} onJoined={(id) => { setBrowse(false); onChanged(); router.push(chatHref(id)); }} />
    </div>
  );
}
