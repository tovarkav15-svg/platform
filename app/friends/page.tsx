import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseNiches } from "@/lib/niches";
import { normalizeUsername } from "@/lib/username";
import type { FriendState } from "@/lib/social";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { FriendActions } from "./FriendActions";

export const metadata: Metadata = { title: "Друзья" };

type Tab = "all" | "requests" | "find";
type Props = { searchParams: Promise<{ tab?: string; q?: string }> };

const person = {
  select: { id: true, username: true, role: true, profile: { select: { displayName: true, avatar: true, accent: true, niches: true } } },
} as const;

export default async function FriendsPage({ searchParams }: Props) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const tab: Tab = sp.tab === "requests" || sp.tab === "find" ? sp.tab : "all";
  const q = (sp.q ?? "").trim().slice(0, 40);

  const links = await db.friendship.findMany({
    where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
    include: { requester: person, addressee: person },
    orderBy: { createdAt: "desc" },
  });

  const friends = links.filter((l) => l.status === "accepted").map((l) => (l.requesterId === me.id ? l.addressee : l.requester));
  const incoming = links.filter((l) => l.status === "pending" && l.addresseeId === me.id).map((l) => l.requester);
  const outgoing = links.filter((l) => l.status === "pending" && l.requesterId === me.id).map((l) => l.addressee);

  const stateOf = (id: string): FriendState => {
    const l = links.find((x) => x.requesterId === id || x.addresseeId === id);
    if (!l) return "none";
    if (l.status === "accepted") return "friends";
    return l.requesterId === me.id ? "outgoing" : "incoming";
  };

  let found: typeof friends = [];
  if (tab === "find") {
    const uq = normalizeUsername(q);
    found = await db.user.findMany({
      where: {
        id: { not: me.id },
        ...(q ? { OR: [{ username: { contains: uq } }, { profile: { displayName: { contains: q } } }] } : {}),
      },
      ...person,
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "Друзья", count: friends.length },
    { id: "requests", label: "Заявки", count: incoming.length },
    { id: "find", label: "Найти людей" },
  ];

  return (
    <>
      <TopBar />
      <main className="page">
        <div>
          <div className="label">Друзья</div>
          <h1 className="h-xl caps">Свои <span className="it">люди</span></h1>
        </div>

        <nav className="seg" aria-label="Вкладки друзей">
          {tabs.map((t) => (
            <Link key={t.id} href={`/friends${t.id === "all" ? "" : `?tab=${t.id}`}`} className="seg-item" aria-current={tab === t.id ? "page" : undefined}>
              {t.label}
              {!!t.count && <span className={t.id === "requests" ? "count-badge" : "count-plain"}>{t.count}</span>}
            </Link>
          ))}
        </nav>

        {tab === "all" && (
          friends.length
            ? <PeopleList people={friends} stateOf={stateOf} />
            : <Empty title="Пока никого" text="Найди людей по нише или юзернейму и добавь в друзья." cta={{ href: "/friends?tab=find", label: "Найти людей" }} />
        )}

        {tab === "requests" && (
          <>
            {incoming.length
              ? <PeopleList people={incoming} stateOf={stateOf} />
              : <Empty title="Новых заявок нет" text="Когда кто-то захочет дружить, заявка появится здесь." />}
            {outgoing.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 8 }}>Ты отправил</div>
                <PeopleList people={outgoing} stateOf={stateOf} />
              </>
            )}
          </>
        )}

        {tab === "find" && (
          <>
            <form className="search" role="search">
              <input type="hidden" name="tab" value="find" />
              <div className="input">
                <input id="q" name="q" defaultValue={q} placeholder="Имя или @юзернейм" autoComplete="off" />
              </div>
              <button className="btn" type="submit">Найти</button>
            </form>
            {found.length
              ? <PeopleList people={found} stateOf={stateOf} />
              : <Empty title="Никого не нашли" text="Попробуй другое имя или юзернейм." />}
          </>
        )}
      </main>
    </>
  );
}

type Person = { id: string; username: string; role: string; profile: { displayName: string; avatar: string | null; accent: string; niches: string } | null };

function PeopleList({ people, stateOf }: { people: Person[]; stateOf: (id: string) => FriendState }) {
  return (
    <ul className="people">
      {people.map((p, i) => (
        <li key={p.id} className="person" style={{ "--i": i } as React.CSSProperties}>
          <Link href={`/u/${p.username}`} className="person-main">
            <Avatar name={p.profile?.displayName ?? p.username} avatar={p.profile?.avatar} accent={p.profile?.accent} size={52} />
            <span className="person-text">
              <b>{p.profile?.displayName ?? p.username}{p.role === "founder" && <span className="badge sm">Основатель</span>}</b>
              <small>@{p.username}</small>
              <span className="person-niches">
                {parseNiches(p.profile?.niches ?? "").slice(0, 3).map((n) => (
                  <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>
                ))}
              </span>
            </span>
          </Link>
          <FriendActions userId={p.id} state={stateOf(p.id)} compact />
        </li>
      ))}
    </ul>
  );
}

function Empty({ title, text, cta }: { title: string; text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="empty">
      <b className="caps">{title}</b>
      <p className="lead">{text}</p>
      {cta && <Link className="btn" href={cta.href}>{cta.label}</Link>}
    </div>
  );
}
