"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { profileHref } from "@/lib/links";

export function NavTabs({ me }: { me: Profile }) {
  const path = usePathname();
  const params = useSearchParams();
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);

  // Счётчики непрочитанных и заявок обновляются сами
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [chats, reqs] = await Promise.all([
        supabase.rpc("list_chats"),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("addressee", me.id).eq("status", "pending"),
      ]);
      if (!alive) return;
      if (chats.data) setUnread(chats.data.reduce((s: number, c: { unread: number }) => s + c.unread, 0));
      setRequests(reqs.count ?? 0);
    };
    tick();
    const t = setInterval(tick, 8000);
    window.addEventListener("chats:refresh", tick);
    window.addEventListener("friends:refresh", tick);
    return () => {
      alive = false; clearInterval(t);
      window.removeEventListener("chats:refresh", tick);
      window.removeEventListener("friends:refresh", tick);
    };
  }, [me.id]);

  const isMyProfile = path.startsWith("/u") && params.get("n") === me.username;
  const tabs = [
    { href: profileHref(me.username), label: "Профиль", active: isMyProfile },
    { href: "/workspace/", label: "Workspace", active: path.startsWith("/workspace") },
    { href: "/goals/", label: "Цели", active: path.startsWith("/goals") },
    { href: "/people/", label: "People", active: path.startsWith("/people") },
    { href: "/community/", label: "Community", active: path.startsWith("/community"), count: requests },
    { href: "/discover/", label: "Discover", active: path.startsWith("/discover") || path.startsWith("/project") },
    { href: "/messages/", label: "Чаты", active: path.startsWith("/messages"), count: unread },
  ];

  return (
    <nav className="navtabs" aria-label="Разделы">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} className="navtab" aria-current={t.active ? "page" : undefined}>
          {t.label}
          {!!t.count && <span className="count-badge">{t.count > 99 ? "99+" : t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
