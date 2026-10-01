import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseNiches } from "@/lib/niches";
import { normalizeUsername } from "@/lib/username";
import { ProfileHeader } from "../../ProfileHeader";
import { TopBar } from "../../TopBar";
import { FriendActions } from "../../friends/FriendActions";
import { friendState } from "@/lib/social";

type Props = { params: Promise<{ username: string }> };

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

async function load(raw: string) {
  const username = normalizeUsername(decodeURIComponent(raw));
  return db.user.findUnique({ where: { username }, include: { profile: true } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const user = await load((await params).username);
  return { title: user ? `${user.profile?.displayName ?? user.username} (@${user.username})` : "Профиль не найден" };
}

export default async function ProfilePage({ params }: Props) {
  const [user, me] = await Promise.all([load((await params).username), getCurrentUser()]);
  if (!user || !user.profile) notFound();

  const p = user.profile;
  const isMe = me?.id === user.id;
  // Сумма уходит в страницу только владельцу или если он сам открыл её всем
  const canSeeEarnings = isMe || p.showEarnings;
  const niches = parseNiches(p.niches);
  const pct = p.earningsGoal ? Math.min(100, Math.round((p.earnings / p.earningsGoal) * 100)) : 0;
  const since = user.createdAt.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const friendsCount = await db.friendship.count({
    where: { status: "accepted", OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
  });

  return (
    <>
      <TopBar />
      <main className="page">
        <ProfileHeader
          displayName={p.displayName} username={user.username} bio={p.bio}
          accent={p.accent} cover={p.cover} avatar={p.avatar} founder={user.role === "founder"}
          meta={
            <div className="links">
              <span className="label">На платформе с {since}</span>
              <span className="label">{friendsCount} {plural(friendsCount, "друг", "друга", "друзей")}</span>
              {p.telegram && <a href={`https://t.me/${p.telegram}`} target="_blank" rel="noopener noreferrer">Telegram</a>}
              {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer nofollow">Сайт</a>}
            </div>
          }
          actions={isMe
            ? <Link className="btn" href="/settings">Редактировать</Link>
            : me
              ? <FriendActions userId={user.id} state={await friendState(me.id, user.id)} />
              : <Link className="btn" href="/login">Войти, чтобы написать</Link>}
        />

        <div className="grid2">
          {canSeeEarnings ? (
            <section className="card money">
              <div className="label">{isMe ? "Сколько ты заработал" : "Заработал в этом месяце"}</div>
              <div className="sum">{fmt(p.earnings)}<span className="it">₽</span></div>
              {isMe && <div className="private"><i></i>{p.showEarnings ? "Видят все" : "Видишь только ты"}</div>}
              {p.earningsGoal > 0 && (
                <>
                  <div className="bar"><b style={{ width: `${pct}%` }} /></div>
                  <div className="money-row"><span>Цель: {fmt(p.earningsGoal)} ₽</span><span>{pct}%</span></div>
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
              <p className="lead">{isMe ? <>Ниши не выбраны. <Link href="/settings">Выбрать</Link></> : "Ниши не выбраны."}</p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
