"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatListItem, Profile } from "@/lib/supabase";
import { chatHref, profileHref } from "@/lib/links";
import { Avatar } from "./Avatar";
import { ChatAvatar, chatTitle } from "./messages/ChatAvatar";

export type NavTab = { href: string; label: string; active: boolean; count?: number; icon: string };

const W = 300; // ширина шторки

/** Иконки разделов — тонкие линии, как в мобильном ChatGPT */
const ICON: Record<string, React.ReactNode> = {
  profile: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></>,
  workspace: <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M4 10h16M9 10v9" /></>,
  learn: <><path d="M4 6.5c2.8-1.3 5.5-1.3 8 0v12c-2.5-1.3-5.2-1.3-8 0z" /><path d="M20 6.5c-2.8-1.3-5.5-1.3-8 0v12c2.5-1.3 5.2-1.3 8 0z" /></>,
  community: <><circle cx="9" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.5" /><path d="M3.5 18.5c.9-2.8 3-4.3 5.5-4.3s4.6 1.5 5.5 4.3M14.5 15c2.6-.6 4.9.6 6 3.5" /></>,
  jobs: <><rect x="4" y="7.5" width="16" height="11.5" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M4 12.5h16" /></>,
  aura: <><circle cx="12" cy="12" r="7.5" /><path d="M12 7.5l1.3 3.2 3.2 1.3-3.2 1.3L12 16.5l-1.3-3.2L7.5 12l3.2-1.3z" /></>,
  chats: <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h0A2.5 2.5 0 0 1 5 13.5z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  moderation: <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z" />,
};
const Ico = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>
);

/** Боковая шторка для телефона: кнопка ≡ или свайп от левого края; закрывается свайпом влево, тапом мимо или переходом */
export function MobileDrawer({ me, tabs, chats }: { me: Profile; tabs: NavTab[]; chats: ChatListItem[] }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null); // текущее смещение шторки в px (0 — закрыта, W — открыта)
  const touch = useRef<{ x: number; y: number; t: number; base: number; lock: "x" | "y" | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const path = usePathname();
  const params = useSearchParams();

  // Переход по ссылке закрывает шторку
  const where = `${path}?${params.toString()}`;
  useEffect(() => { setOpen(false); }, [where]);
  // Пока открыта — страница под ней не скроллится, Escape закрывает
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [open]);

  // Жесты: свайп вправо от края экрана открывает, свайп влево по открытой шторке закрывает
  useEffect(() => {
    const mobile = () => window.matchMedia("(max-width: 760px)").matches;
    const start = (e: TouchEvent) => {
      if (!mobile() || e.touches.length !== 1) return;
      const p = e.touches[0];
      if (!open && p.clientX > 24) return;
      touch.current = { x: p.clientX, y: p.clientY, t: Date.now(), base: open ? W : 0, lock: null };
    };
    const move = (e: TouchEvent) => {
      const s = touch.current;
      if (!s) return;
      const p = e.touches[0];
      const dx = p.clientX - s.x, dy = p.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        s.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (s.lock !== "x") { touch.current = null; setDrag(null); return; }
      if (e.cancelable) e.preventDefault();
      setDrag(Math.max(0, Math.min(W, s.base + dx)));
    };
    const end = (e: TouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s || s.lock !== "x") return setDrag(null);
      const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
      const v = dx / Math.max(1, Date.now() - s.t); // px/мс
      const pos = Math.max(0, Math.min(W, s.base + dx));
      setOpen(v > 0.45 ? true : v < -0.45 ? false : pos > W / 2);
      setDrag(null);
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [open]);

  const x = drag ?? (open ? W : 0);
  const shown = x > 0;
  const total = tabs.reduce((a, t) => a + (t.count ?? 0), 0);

  return (
    <>
      <button type="button" className="nav-burger" aria-label="Открыть меню" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 16h10" /></svg>
        {total > 0 && <i className="nav-burger-dot" aria-hidden="true" />}
      </button>

      {mounted && createPortal(<>
      <div className={`md-shade ${shown ? "on" : ""}`} style={{ opacity: x / W, transition: drag === null ? undefined : "none" }} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`md-drawer ${shown ? "on" : ""}`} style={{ transform: `translateX(${x - W}px)`, transition: drag === null ? undefined : "none" }}
        aria-label="Меню" aria-hidden={!open} inert={!open}>
        <div className="md-top">
          <Link href="/" className="logo relic-logo"><i aria-hidden="true" />Relic</Link>
          <button type="button" className="md-close" aria-label="Закрыть меню" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="md-scroll">
          <nav className="md-nav" aria-label="Разделы">
            {tabs.map((t, i) => (
              <Link key={t.label} href={t.href} className="md-item" aria-current={t.active ? "page" : undefined} style={{ "--i": i } as React.CSSProperties}>
                <Ico name={t.icon} />
                <span>{t.label}</span>
                {!!t.count && <em className="count-badge">{t.count > 99 ? "99+" : t.count}</em>}
              </Link>
            ))}
          </nav>

          {chats.length > 0 && (
            <section className="md-chats">
              <div className="md-label"><span>Недавние чаты</span><Link href="/messages/">Все</Link></div>
              {chats.map((c) => (
                <Link key={c.chat_id} href={chatHref(c.chat_id)} className={`md-chat ${c.unread ? "unread" : ""}`}>
                  <ChatAvatar c={c} size={30} />
                  <span><b>{chatTitle(c)}</b><small>{c.last_text || "Нет сообщений"}</small></span>
                  {c.unread > 0 && <em className="count-badge">{c.unread > 99 ? "99+" : c.unread}</em>}
                </Link>
              ))}
            </section>
          )}
        </div>

        <Link href={profileHref(me.username)} className="md-me">
          <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={36} userId={me.id} />
          <span><b>{me.display_name}</b><small>@{me.username}</small></span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </Link>
      </aside>
      </>, document.body)}
    </>
  );
}
