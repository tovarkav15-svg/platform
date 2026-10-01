"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { chatHref } from "@/lib/links";
import { accentColor } from "@/lib/style";
import { TopBar } from "../TopBar";
import { Banner } from "../ProfileHeader";
import { ChatAvatar } from "../messages/ChatAvatar";
import { CountUp } from "../CountUp";

type Card = { chat_id: string; kind: "group" | "channel"; title: string; description: string; avatar: string | null; accent: string; emoji: string; username: string | null;
  banner_preset: string; banner: string | null; member_count: number; joined: boolean; requested: boolean; mode: "join" | "request" | "invite"; valid: boolean };

/** Страница приглашения: по коду ссылки или по юзернейму канала/группы */
export function JoinCard({ code, username }: { code?: string | null; username?: string | null }) {
  const { ready, me } = useSession();
  const router = useRouter();
  const [card, setCard] = useState<Card | null | "missing">(null);
  const [state, setState] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    supabase.rpc("chat_card", { p_code: code ?? null, p_username: username ?? null }).then(({ data }) => {
      const c = (data as Card[] | null)?.[0];
      setCard(c ?? "missing");
      if (c) document.title = c.title;
    });
  }, [ready, code, username]);

  if (card === null) return (<><TopBar /><main className="page"><div className="skeleton profile-skeleton" /></main></>);
  if (card === "missing") return (<><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Ссылка не найдена. Возможно, её отключили.</p><Link className="btn" href="/messages/">К чатам</Link></div></main></>);

  const kindName = card.kind === "channel" ? "канал" : "группа";
  async function join() {
    if (!card || card === "missing") return;
    setBusy(true);
    const { data } = await supabase.rpc("join_chat", { p_code: code ?? null, p_chat: code ? null : card.chat_id });
    setBusy(false);
    if (data === "joined" || data === "member") router.push(chatHref(card.chat_id));
    else setState(String(data));
  }

  return (
    <>
      <TopBar />
      <div className="lr-bg" aria-hidden="true" style={{ "--c": accentColor(card.accent) } as React.CSSProperties}><i /><i /><i /></div>
      <main className="page join-page">
        <section className="join-card" style={{ "--c": accentColor(card.accent) } as React.CSSProperties}>
          <Banner image={card.banner} preset={card.banner_preset} className="join-banner" />
          <div className="join-body">
            <span className="join-ava"><ChatAvatar size={96} c={{ kind: card.kind, avatar: card.avatar, accent: card.accent, emoji: card.emoji, title: card.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} /></span>
            <span className="label">{code ? `Тебя пригласили в ${card.kind === "channel" ? "канал" : "группу"}` : kindName}</span>
            <h1 className="join-title">{card.title}</h1>
            {card.username && <span className="join-handle it">@{card.username}</span>}
            {card.description && <p className="lead">{card.description}</p>}
            <div className="join-count"><b className="mono"><CountUp value={card.member_count} /></b><span>{card.kind === "channel" ? "подписчиков" : "участников"}</span></div>
            {!me ? (
              <Link className="btn" href="/login">Войти, чтобы вступить</Link>
            ) : card.joined ? (
              <Link className="btn" href={chatHref(card.chat_id)}>Открыть {kindName === "канал" ? "канал" : "группу"}</Link>
            ) : !card.valid || state === "invalid" ? (
              <p className="form-error">Ссылка больше не действует.</p>
            ) : state === "requested" || card.requested ? (
              <p className="join-wait">Заявка отправлена. Админы её рассмотрят, и чат появится в твоём списке.</p>
            ) : card.mode === "invite" || state === "invite_only" ? (
              <p className="join-wait">Вступить можно только по пригласительной ссылке от админа.</p>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={join}>
                {busy ? "…" : card.mode === "request" ? "Подать заявку" : card.kind === "channel" ? "Подписаться" : "Вступить"}
              </button>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
