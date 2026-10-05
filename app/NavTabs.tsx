"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type ChatListItem, type Profile } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { useLive } from "@/lib/live";
import { MobileDrawer, type NavTab } from "./MobileDrawer";

export function NavTabs({ me }: { me: Profile }) {
  const path = usePathname();
  const params = useSearchParams();
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [modCount, setModCount] = useState(0);
  const [recent, setRecent] = useState<ChatListItem[]>([]);
  // Счётчики в меню пересчитываются, как только что-то изменилось
  const [navTick, setNavTick] = useState(0);
  useLive(["order_responses", "orders", "jobs", "reports", "friendships"], () => setNavTick((t) => t + 1), { poll: 60000 });
  const [jobCount, setJobCount] = useState(0);
  // Заказчику — сколько новых откликов ждут ответа
  useEffect(() => {
    const tick = () => supabase.from("order_responses").select("id, orders!inner(client_id, status)", { count: "exact", head: true })
      .eq("orders.client_id", me.id).eq("orders.status", "open").eq("status", "sent").then(({ count }) => setJobCount(count ?? 0));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [me.id, navTick]);
  // Модераторам — сколько бейджей и жалоб ждут
  useEffect(() => {
    if (me.role !== "owner" && me.role !== "founder") return;
    const tick = () => Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("mod_status", "pending"),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("mod_status", "pending"),
    ]).then(([b, r, o]) => setModCount((b.count ?? 0) + (r.count ?? 0) + (o.count ?? 0)));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [me.role, navTick]);

  // Счётчики непрочитанных и заявок обновляются сами
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [chats, reqs] = await Promise.all([
        supabase.rpc("list_chats"),
        supabase.from("friendships").select("id", { count: "exact", head: true }).eq("addressee", me.id).eq("status", "pending"),
      ]);
      if (!alive) return;
      // Обращения в поддержку не входят в общий счётчик — их видно во вкладке «Обращения»
      if (chats.data) setRecent((chats.data as ChatListItem[]).filter((c) => !(c.kind === "support" && c.support_for !== me.id) && c.last_at).sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? "")).slice(0, 6));
      if (chats.data) setUnread(chats.data.reduce((s: number, c: { unread: number; kind: string; support_for: string | null }) => s + (c.kind === "support" && c.support_for !== me.id ? 0 : c.unread), 0));
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
  }, [me.id, navTick]);

  const isMyProfile = path.startsWith("/u") && params.get("n") === me.username;
  const tabs: NavTab[] = [
    { href: profileHref(me.username), label: "Профиль", active: isMyProfile, icon: "profile" },
    { href: "/workspace/", label: "Workspace", active: path.startsWith("/workspace"), icon: "workspace" },
    { href: "/learn/", label: "Обучение", active: path.startsWith("/learn"), icon: "learn" },
    { href: "/community/", label: "Community", active: ["/community", "/people", "/discover", "/project"].some((p) => path.startsWith(p)), count: requests, icon: "community" },
    { href: "/jobs/", label: "Биржа", active: path.startsWith("/jobs") || path.startsWith("/deal"), count: jobCount, icon: "jobs" },
    { href: "/aura/", label: "AURA", active: path.startsWith("/aura"), icon: "aura" },
    { href: "/messages/", label: "Чаты", active: path.startsWith("/messages"), count: unread, icon: "chats" },
    { href: "/settings/", label: "Settings", active: path.startsWith("/settings"), icon: "settings" },
    ...(me.role === "owner" || me.role === "founder" ? [{ href: "/moderation/", label: "Модерация", active: path.startsWith("/moderation"), count: modCount, icon: "moderation" }] : []),
  ];

  // В фокусе виден только Workspace
  const inFocus = !!me.focus_until && new Date(me.focus_until) > new Date();
  const visible = inFocus ? tabs.filter((t) => t.href === "/workspace/" || t.href === "/learn/") : tabs;

  return (
    <>
    <MobileDrawer me={me} tabs={visible} chats={inFocus ? [] : recent} />
    <nav className={`navtabs ${inFocus ? "focus" : ""}`} aria-label="Разделы">
      {visible.map((t) => (
        <Link key={t.label} href={t.href} className="navtab" aria-current={t.active ? "page" : undefined}>
          {t.label}
          {!!t.count && <span className="count-badge">{t.count > 99 ? "99+" : t.count}</span>}
        </Link>
      ))}
    </nav>
    </>
  );
}
