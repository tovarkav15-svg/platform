"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type FriendState } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { normalizeUsername } from "@/lib/username";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { FriendActions } from "../FriendActions";

type Tab = "all" | "requests" | "find";
type Person = { id: string; username: string; display_name: string; avatar: string | null; accent: string; niches: string; role: string };
type Link_ = { requester: string; addressee: string; status: string; r: Person; a: Person };

export default function FriendsPage() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const router = useRouter();
  const tab: Tab = sp.get("tab") === "requests" || sp.get("tab") === "find" ? (sp.get("tab") as Tab) : "all";
  const q = (sp.get("q") ?? "").trim().slice(0, 40);

  const [links, setLinks] = useState<Link_[] | null>(null);
  const [found, setFound] = useState<Person[] | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase
      .from("friendships")
      .select(`requester, addressee, status, r:profiles!friendships_requester_fkey(${PROFILE_CARD}), a:profiles!friendships_addressee_fkey(${PROFILE_CARD})`)
      .order("created_at", { ascending: false });
    setLinks((data as unknown as Link_[]) ?? []);
  }, [me]);

  useEffect(() => { document.title = "Друзья"; load(); }, [load]);

  useEffect(() => {
    if (!me || tab !== "find") return;
    setFound(null);
    let query = supabase.from("profiles").select(PROFILE_CARD).neq("id", me.id).order("created_at", { ascending: false }).limit(30);
    if (q) {
      const safe = q.replace(/[%,()]/g, "");
      query = query.or(`username.ilike.%${normalizeUsername(safe)}%,display_name.ilike.%${safe}%`);
    }
    query.then(({ data }) => setFound((data as Person[]) ?? []));
  }, [me, tab, q]);

  if (!me || !links) {
    return (<><TopBar /><main className="page"><div className="skeleton profile-skeleton" /></main></>);
  }

  const friends = links.filter((l) => l.status === "accepted").map((l) => (l.requester === me.id ? l.a : l.r));
  const incoming = links.filter((l) => l.status === "pending" && l.addressee === me.id).map((l) => l.r);
  const outgoing = links.filter((l) => l.status === "pending" && l.requester === me.id).map((l) => l.a);

  const stateOf = (id: string): FriendState => {
    const l = links.find((x) => x.requester === id || x.addressee === id);
    if (!l) return "none";
    if (l.status === "accepted") return "friends";
    return l.requester === me.id ? "outgoing" : "incoming";
  };

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
            <Link key={t.id} href={`/friends/${t.id === "all" ? "" : `?tab=${t.id}`}`} className="seg-item" aria-current={tab === t.id ? "page" : undefined}>
              {t.label}
              {!!t.count && <span className={t.id === "requests" ? "count-badge" : "count-plain"}>{t.count}</span>}
            </Link>
          ))}
        </nav>

        {tab === "all" && (friends.length
          ? <PeopleList people={friends} stateOf={stateOf} onChange={load} />
          : <Empty title="Пока никого" text="Найди людей по нише или юзернейму и добавь в друзья." cta={{ href: "/friends/?tab=find", label: "Найти людей" }} />)}

        {tab === "requests" && (
          <>
            {incoming.length
              ? <PeopleList people={incoming} stateOf={stateOf} onChange={load} />
              : <Empty title="Новых заявок нет" text="Когда кто-то захочет дружить, заявка появится здесь." />}
            {outgoing.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 8 }}>Ты отправил</div>
                <PeopleList people={outgoing} stateOf={stateOf} onChange={load} />
              </>
            )}
          </>
        )}

        {tab === "find" && (
          <>
            <form
              className="search" role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const v = String(new FormData(e.currentTarget).get("q") ?? "").trim();
                router.replace(`/friends/?tab=find${v ? `&q=${encodeURIComponent(v)}` : ""}`);
              }}
            >
              <div className="input"><input id="q" name="q" defaultValue={q} placeholder="Имя или @юзернейм" autoComplete="off" /></div>
              <button className="btn" type="submit">Найти</button>
            </form>
            {found === null ? <div className="skeleton list-skeleton" /> : found.length
              ? <PeopleList people={found} stateOf={stateOf} onChange={load} />
              : <Empty title="Никого не нашли" text="Попробуй другое имя или юзернейм." />}
          </>
        )}
      </main>
    </>
  );
}

function PeopleList({ people, stateOf, onChange }: { people: Person[]; stateOf: (id: string) => FriendState; onChange: () => void }) {
  return (
    <ul className="people">
      {people.map((p, i) => (
        <li key={p.id} className="person" style={{ "--i": i } as React.CSSProperties}>
          <Link href={profileHref(p.username)} className="person-main">
            <Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={52} />
            <span className="person-text">
              <b>{p.display_name}{p.role === "founder" && <span className="badge sm">Основатель</span>}</b>
              <small>@{p.username}</small>
              <span className="person-niches">
                {parseNiches(p.niches).slice(0, 3).map((n) => (
                  <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>
                ))}
              </span>
            </span>
          </Link>
          <FriendActions userId={p.id} state={stateOf(p.id)} compact onChange={onChange} />
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
