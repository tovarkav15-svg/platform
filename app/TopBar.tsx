import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listChats } from "@/lib/social";
import { logout } from "./actions";
import { NavTabs } from "./NavTabs";
import { Avatar } from "./Avatar";

export async function TopBar() {
  const me = await getCurrentUser();

  if (!me) {
    return (
      <header className="topbar">
        <Link href="/" className="logo caps">Название</Link>
        <nav style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" href="/login">Войти</Link>
          <Link className="btn" href="/register">Регистрация</Link>
        </nav>
      </header>
    );
  }

  const [chats, requests] = await Promise.all([
    listChats(me.id),
    db.friendship.count({ where: { addresseeId: me.id, status: "pending" } }),
  ]);
  const unread = chats.reduce((s, c) => s + c.unread, 0);

  return (
    <header className="topbar">
      <Link href="/" className="logo caps">Название</Link>
      <NavTabs username={me.username} unread={unread} requests={requests} />
      <div className="topbar-me">
        <Link href={`/u/${me.username}`} className="me-link" aria-label="Мой профиль">
          <Avatar name={me.profile?.displayName ?? me.username} avatar={me.profile?.avatar} accent={me.profile?.accent} size={32} />
        </Link>
        <form action={logout}><button className="btn ghost sm" type="submit">Выйти</button></form>
      </div>
    </header>
  );
}
