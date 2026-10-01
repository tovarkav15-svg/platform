"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { NavTabs } from "./NavTabs";
import { Avatar } from "./Avatar";

export function TopBar() {
  const { ready, me } = useSession();
  const router = useRouter();

  return (
    <header className="topbar">
      <Link href="/" className="logo caps">Название</Link>
      {me ? (
        <>
          <NavTabs me={me} />
          <div className="topbar-me">
            <Link href="/settings/" className="icon-link" aria-label="Настройки" title="Настройки">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.3 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2.1-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>
            </Link>
            <Link href={profileHref(me.username)} className="me-link" aria-label="Мой профиль">
              <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={32} userId={me.id} />
            </Link>
            <button className="btn ghost sm" type="button" onClick={async () => { await signOut(); router.replace("/login"); }}>Выйти</button>
          </div>
        </>
      ) : ready ? (
        <nav style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" href="/login">Войти</Link>
          <Link className="btn" href="/register">Регистрация</Link>
        </nav>
      ) : null}
    </header>
  );
}
