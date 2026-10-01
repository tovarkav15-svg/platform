"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Earnings, type FriendState, type Profile } from "@/lib/supabase";
import { friendState } from "@/lib/api";
import { useSession } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
import { normalizeUsername } from "@/lib/username";
import { ProfileHeader } from "../ProfileHeader";
import { TopBar } from "../TopBar";
import { FriendActions } from "../FriendActions";

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

type Data = { user: Profile; earnings: Earnings | null; friends: number; state: FriendState | null };

export default function ProfilePage() {
  const username = normalizeUsername(useSearchParams().get("n") ?? "");
  const { ready, me } = useSession();
  const [data, setData] = useState<Data | null | "missing">(null);

  const load = useCallback(async () => {
    const { data: user } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
    if (!user) return setData("missing");
    // Доход отдаёт сама база: владельцу всегда, остальным только если он открыт
    const [{ data: earnings }, { data: friends }, state] = await Promise.all([
      supabase.from("earnings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("friend_count", { p_user: user.id }),
      me ? friendState(me.id, user.id) : Promise.resolve(null),
    ]);
    setData({ user: user as Profile, earnings: earnings as Earnings | null, friends: friends ?? 0, state });
  }, [username, me]);

  useEffect(() => {
    if (!ready) return;
    if (!username) return setData("missing");
    load();
  }, [ready, username, load]);

  useEffect(() => {
    if (data && data !== "missing") document.title = `${data.user.display_name} (@${data.user.username})`;
  }, [data]);

  return (
    <>
      <TopBar />
      <main className="page">
        {data === null && <div className="skeleton profile-skeleton" />}
        {data === "missing" && (
          <div className="empty">
            <b className="caps">Профиль не найден</b>
            <p className="lead">Проверь юзернейм в ссылке.</p>
            <Link className="btn" href="/">На главную</Link>
          </div>
        )}
        {data && data !== "missing" && <ProfileView {...data} isMe={me?.id === data.user.id} loggedIn={!!me} reload={load} />}
      </main>
    </>
  );
}

function ProfileView({ user, earnings, friends, state, isMe, loggedIn, reload }: Data & { isMe: boolean; loggedIn: boolean; reload: () => void }) {
  const niches = parseNiches(user.niches);
  const since = new Date(user.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const pct = earnings?.goal ? Math.min(100, Math.round((earnings.amount / earnings.goal) * 100)) : 0;

  return (
    <>
      <ProfileHeader
        displayName={user.display_name} username={user.username} bio={user.bio}
        accent={user.accent} cover={user.cover} avatar={user.avatar} founder={user.role === "founder"}
        meta={
          <div className="links">
            <span className="label">На платформе с {since}</span>
            <span className="label">{friends} {plural(friends, "друг", "друга", "друзей")}</span>
            {user.telegram && <a href={`https://t.me/${user.telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}
            {user.website && <a href={user.website} target="_blank" rel="noopener noreferrer nofollow">Сайт</a>}
          </div>
        }
        actions={isMe
          ? <Link className="btn" href="/settings/">Редактировать</Link>
          : loggedIn && state
            ? <FriendActions userId={user.id} state={state} onChange={reload} />
            : <Link className="btn" href="/login">Войти, чтобы написать</Link>}
      />

      <div className="grid2">
        {earnings ? (
          <section className="card money">
            <div className="label">{isMe ? "Сколько ты заработал" : "Заработал в этом месяце"}</div>
            <div className="sum">{fmt(earnings.amount)}<span className="it">₽</span></div>
            {isMe && <div className="private"><i></i>{earnings.is_public ? "Видят все" : "Видишь только ты"}</div>}
            {earnings.goal > 0 && (
              <>
                <div className="bar"><b style={{ width: `${pct}%` }} /></div>
                <div className="money-row"><span>Цель: {fmt(earnings.goal)} ₽</span><span>{pct}%</span></div>
              </>
            )}
          </section>
        ) : (
          <section className="card">
            <div className="label">Активность</div>
            <p className="lead">Здесь появятся марафоны, статьи и достижения @{user.username}.</p>
          </section>
        )}

        <section className="card">
          <div className="label">Ниши</div>
          {niches.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {niches.map((n) => <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>)}
            </div>
          ) : (
            <p className="lead">{isMe ? <>Ниши не выбраны. <Link href="/settings/">Выбрать</Link></> : "Ниши не выбраны."}</p>
          )}
        </section>
      </div>
    </>
  );
}
