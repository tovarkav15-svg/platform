"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Props = { username: string; unread: number; requests: number };

export function NavTabs({ username, unread: initialUnread, requests }: Props) {
  const path = usePathname();
  const [unread, setUnread] = useState(initialUnread);

  // Счётчик непрочитанных обновляется сам
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/chats", { cache: "no-store" });
        if (!r.ok) return;
        const { chats } = await r.json();
        if (alive) setUnread(chats.reduce((s: number, c: { unread: number }) => s + c.unread, 0));
      } catch {}
    };
    const t = setInterval(tick, 6000);
    window.addEventListener("chats:refresh", tick);
    return () => { alive = false; clearInterval(t); window.removeEventListener("chats:refresh", tick); };
  }, []);

  const tabs = [
    { href: `/u/${username}`, label: "Профиль", active: path === `/u/${username}` },
    { href: "/messages", label: "Мессенджер", active: path.startsWith("/messages"), count: unread },
    { href: "/friends", label: "Друзья", active: path.startsWith("/friends"), count: requests },
    { href: "/settings", label: "Настройки", active: path.startsWith("/settings") },
  ];

  return (
    <nav className="navtabs" aria-label="Разделы">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="navtab" aria-current={t.active ? "page" : undefined}>
          {t.label}
          {!!t.count && <span className="count-badge">{t.count > 99 ? "99+" : t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
