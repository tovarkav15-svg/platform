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
  const [modCount, setModCount] = useState(0);
  // Модераторам — сколько бейджей и жалоб ждут
  useEffect(() => {
    if (me.role !== "owner" && me.role !== "founder") return;
    const tick = () => Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("mod_status", "pending"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]).then(([b, r]) => setModCount((b.count ?? 0) + (r.count ?? 0)));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [me.role]);

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
    { href: "/learn/", label: "Обучение", active: path.startsWith("/learn") },
    { href: "/community/", label: "Community", active: ["/community", "/people", "/discover", "/project"].some((p) => path.startsWith(p)), count: requests },
    { href: "/jobs/", label: "Биржа", active: path.startsWith("/jobs") },
    { href: "/aura/", label: "AURA", active: path.startsWith("/aura") },
    { href: "/messages/", label: "Чаты", active: path.startsWith("/messages"), count: unread },
    { href: "/settings/", label: "Settings", active: path.startsWith("/settings") },
    ...(me.role === "owner" || me.role === "founder" ? [{ href: "/moderation/", label: "Модерация", active: path.startsWith("/moderation"), count: modCount }] : []),
  ];

  // В фокусе виден только Workspace
  const inFocus = !!me.focus_until && new Date(me.focus_until) > new Date();
  const visible = inFocus ? tabs.filter((t) => t.href === "/workspace/" || t.href === "/learn/") : tabs;

  return (
    <nav className={`navtabs ${inFocus ? "focus" : ""}`} aria-label="Разделы">
      {visible.map((t) => (
        <Link key={t.label} href={t.href} className="navtab" aria-current={t.active ? "page" : undefined}>
          {t.label}
          {!!t.count && <span className="count-badge">{t.count > 99 ? "99+" : t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
