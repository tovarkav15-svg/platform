"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatListItem, Profile } from "@/lib/supabase";
import { chatHref, profileHref } from "@/lib/links";
import { Avatar } from "./Avatar";
import { ChatAvatar, chatTitle } from "./messages/ChatAvatar";
import { Ico, SECTION_COLOR, usePrevOpen, type NavTab } from "./MobileDrawer";

type Mode = "full" | "rail";
const KEY = "nav:side";

/** Боковая панель на компьютере: полная или свёрнутая до иконок. Место под неё заранее резервирует скрипт в <head> */
export function SideNav({ me, tabs, chats }: { me: Profile; tabs: NavTab[]; chats: ChatListItem[] }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const openedBefore = usePrevOpen("side", tabs);
  useEffect(() => {
    const el = document.documentElement;
    let m = el.dataset.side as Mode | undefined;
    if (m !== "full" && m !== "rail") { m = window.innerWidth >= 1280 ? "full" : "rail"; el.dataset.side = m; }
    setMode(m);
  }, []);
  const toggle = () => {
    const m: Mode = mode === "full" ? "rail" : "full";
    document.documentElement.dataset.side = m;
    try { localStorage.setItem(KEY, m); } catch {}
    setMode(m);
  };
  if (!mode) return null;
  const rail = mode === "rail";

  return createPortal(
    <aside className={`sd ${rail ? "rail" : "full"}`} aria-label="Разделы">
      <div className="sd-top">
        {!rail && <Link href="/" className="logo relic-logo"><i aria-hidden="true" />Relic</Link>}
        <button type="button" className="sd-toggle" onClick={toggle} aria-label={rail ? "Развернуть панель" : "Свернуть панель"} title={rail ? "Развернуть панель" : "Свернуть панель"}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" />{rail ? <path d="m13.5 10 2 2-2 2" /> : <path d="m16 10-2 2 2 2" />}
          </svg>
        </button>
      </div>

      <div className="sd-scroll">
        <nav className="sd-nav">
          {tabs.map((t) => (
            <div key={t.label} className="sd-group">
              <Link href={t.href} className="sd-item" aria-current={t.active && (rail || !t.subs) ? "page" : undefined} data-open={t.active || undefined} title={rail ? t.label : undefined} style={{ "--c": SECTION_COLOR[t.icon] } as React.CSSProperties}>
                <span className="sd-ico"><Ico name={t.icon} />{rail && !!t.count && <i className="sd-dot" aria-hidden="true" />}</span>
                {!rail && <span className="sd-label">{t.label}</span>}
                {!rail && !!t.count && !(t.subs && t.active) && <em className="count-badge">{t.count > 99 ? "99+" : t.count}</em>}
              </Link>
              {!rail && t.subs && (
                <div className="sd-subs" data-open={t.active} style={{ "--c": SECTION_COLOR[t.icon] } as React.CSSProperties} data-anim={t.active && openedBefore !== t.label ? "" : undefined}>
                  <div>
                    {t.subs.map((x) => (
                      <Link key={x.href} href={x.href} className="sd-sub" aria-current={x.active ? "page" : undefined} tabIndex={t.active ? undefined : -1}>
                        <span>{x.label}</span>
                        {!!x.count && <em className="count-badge">{x.count > 99 ? "99+" : x.count}</em>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        {!rail && chats.length > 0 && (
          <section className="sd-chats">
            <div className="sd-head"><span>Недавние чаты</span><Link href="/messages/">Все</Link></div>
            {chats.map((c) => (
              <Link key={c.chat_id} href={chatHref(c.chat_id)} className={`sd-chat ${c.unread ? "unread" : ""}`}>
                <ChatAvatar c={c} size={26} />
                <span className="sd-chat-t"><b>{chatTitle(c)}</b></span>
                {c.unread > 0 && <em className="count-badge">{c.unread > 99 ? "99+" : c.unread}</em>}
              </Link>
            ))}
          </section>
        )}
      </div>

      <Link href={profileHref(me.username)} className="sd-me" title={rail ? me.display_name : undefined}>
        <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={rail ? 34 : 32} userId={me.id} />
        {!rail && <span className="sd-me-t"><b>{me.display_name}</b><small>@{me.username}</small></span>}
      </Link>
    </aside>,
    document.body,
  );
}
