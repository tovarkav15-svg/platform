"use client";

import { signOut, useSession } from "@/lib/session";

/** Если аккаунт забанен — показываем это поверх всего. Сами запреты держит база */
export function BanGate() {
  const { me } = useSession();
  if (!me?.banned_until || new Date(me.banned_until) <= new Date()) return null;
  const forever = new Date(me.banned_until).getFullYear() > 9000;
  return (
    <div className="ban-gate" role="alertdialog" aria-label="Аккаунт заблокирован">
      <div className="ban-card">
        <span className="ban-icon" aria-hidden="true">⊘</span>
        <b>Аккаунт заблокирован</b>
        <p>{forever ? "Модераторы Relic заблокировали аккаунт навсегда." : `Модераторы Relic заблокировали аккаунт до ${new Date(me.banned_until).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`}</p>
        {me.ban_reason && <p className="ban-reason">Причина: {me.ban_reason}</p>}
        <p className="ban-small">Пока бан действует, нельзя писать, звонить, менять профиль и публиковать. Если считаешь это ошибкой — напиши на почту команды.</p>
        <button type="button" className="btn ghost" onClick={() => signOut().then(() => window.location.reload())}>Выйти</button>
      </div>
    </div>
  );
}
