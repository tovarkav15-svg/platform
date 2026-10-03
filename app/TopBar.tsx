"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { profileHref, chatHref } from "@/lib/links";
import { NavTabs } from "./NavTabs";
import { Avatar, PresenceLabel } from "./Avatar";
import { FocusButton, focusLeft } from "./focus/Focus";

export function TopBar() {
  const { ready, me, refreshMe } = useSession();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setMenu(false); setConfirmOut(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <header className="topbar">
      <Link href="/" className="logo relic-logo"><i aria-hidden="true" />Relic</Link>
      {me ? (
        <>
          <NavTabs me={me} />
          <div className="topbar-me">
            <FocusButton />
            <div className="me-menu" ref={box}>
              <button type="button" className="me-link" aria-label="Меню аккаунта" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={34} userId={me.id} />
              </button>
              {menu && (
                <div className="me-pop" role="menu">
                  <div className="me-pop-head">
                    <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={40} userId={me.id} />
                    <span><b>{me.display_name}</b><small>@{me.username}</small><PresenceLabel userId={me.id} /></span>
                  </div>
                  <Link role="menuitem" href={profileHref(me.username)} onClick={() => setMenu(false)}><i>◉</i>Мой профиль</Link>
                  <Link role="menuitem" href="/settings/" onClick={() => setMenu(false)}><i>✎</i>Настройки и оформление</Link>
                  {focusLeft(me.focus_until) > 0 && (
                    <button role="menuitem" type="button" onClick={async () => {
                      setMenu(false);
                      await supabase.from("profiles").update({ focus_until: null }).eq("id", me.id);
                      await refreshMe();
                    }}><i>◎</i>Выйти из фокуса</button>
                  )}
                  <button role="menuitem" type="button" onClick={async () => {
                    setMenu(false);
                    const { data } = await supabase.rpc("open_support");
                    if (data) router.push(chatHref(data as string));
                  }}><i>✚</i>Поддержка</button>
                  <span className="me-pop-sep" />
                  {confirmOut ? (
                    <button role="menuitem" type="button" className="danger" onClick={async () => { await signOut(); router.replace("/login"); }}><i>⏻</i>Точно выйти</button>
                  ) : (
                    <button role="menuitem" type="button" className="danger" onClick={() => setConfirmOut(true)}><i>⏻</i>Выйти из аккаунта</button>
                  )}
                </div>
              )}
            </div>
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
