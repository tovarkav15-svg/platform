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
            <Link href={profileHref(me.username)} className="me-link" aria-label="Мой профиль">
              <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={32} />
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
