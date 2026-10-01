"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type Project, type ProfileCard } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { useFriendLinks } from "@/lib/useFriendLinks";
import { TopBar } from "../TopBar";
import { Empty, PeopleList } from "../PeopleList";
import { ProjectCard } from "../Cards";

type Tab = "friends" | "requests" | "teams";
type Team = { project: Project; author: ProfileCard };

export default function CommunityPage() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const tab: Tab = sp.get("tab") === "requests" || sp.get("tab") === "teams" ? (sp.get("tab") as Tab) : "friends";
  const fl = useFriendLinks(me?.id);
  const [teams, setTeams] = useState<Team[] | null>(null);

  useEffect(() => { document.title = "Community"; }, []);

  // Команды: мои проекты и проекты, куда меня добавили
  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data: memberOf } = await supabase.from("project_members").select("project_id").eq("user_id", me.id);
      const ids = (memberOf ?? []).map((m) => m.project_id);
      const { data } = await supabase
        .from("projects")
        .select(`*, author:profiles!projects_user_id_fkey(${PROFILE_CARD})`)
        .or(`user_id.eq.${me.id}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`)
        .order("updated_at", { ascending: false });
      setTeams(((data as unknown as (Project & { author: ProfileCard })[]) ?? []).map(({ author, ...project }) => ({ project, author })));
    })();
  }, [me]);

  const tabs: { id: Tab; label: string; count?: number; hot?: boolean }[] = [
    { id: "friends", label: "Друзья", count: fl.friends.length },
    { id: "requests", label: "Заявки", count: fl.incoming.length, hot: true },
    { id: "teams", label: "Команды", count: teams?.length },
  ];

  return (
    <>
      <TopBar />
      <main className="page">
        <div>
          <div className="label">Community</div>
          <h1 className="h-xl caps">С кем ты <span className="it">строишь</span></h1>
        </div>

        <nav className="seg" aria-label="Вкладки">
          {tabs.map((t) => (
            <Link key={t.id} href={`/community/${t.id === "friends" ? "" : `?tab=${t.id}`}`} replace className="seg-item" aria-current={tab === t.id ? "page" : undefined}>
              {t.label}
              {!!t.count && <span className={t.hot ? "count-badge" : "count-plain"}>{t.count}</span>}
            </Link>
          ))}
        </nav>

        {!fl.loaded ? <div className="skeleton list-skeleton" /> : (
          <>
            {tab === "friends" && (fl.friends.length
              ? <PeopleList people={fl.friends} stateOf={fl.stateOf} onChange={fl.reload} />
              : <Empty title="Пока никого" text="Найди людей по нише или навыку и добавь в друзья." cta={{ href: "/people/", label: "Найти людей" }} />)}

            {tab === "requests" && (
              <>
                {fl.incoming.length
                  ? <PeopleList people={fl.incoming} stateOf={fl.stateOf} onChange={fl.reload} />
                  : <Empty title="Новых заявок нет" text="Когда кто-то захочет дружить, заявка появится здесь." />}
                {fl.outgoing.length > 0 && (
                  <>
                    <div className="label" style={{ marginTop: 8 }}>Ты отправил</div>
                    <PeopleList people={fl.outgoing} stateOf={fl.stateOf} onChange={fl.reload} />
                  </>
                )}
              </>
            )}

            {tab === "teams" && (teams === null ? <div className="skeleton list-skeleton" /> : teams.length ? (
              <div className="pgrid">
                {teams.map((t, i) => <ProjectCard key={t.project.id} project={t.project} author={t.project.user_id === me?.id ? undefined : t.author} i={i} />)}
              </div>
            ) : (
              <Empty title="Команд пока нет" text="Создай проект в профиле и добавь в него друзей, или попроси автора проекта добавить тебя." cta={me ? { href: `/u/?n=${me.username}&tab=projects`, label: "К моим проектам" } : undefined} />
            ))}
          </>
        )}
      </main>
    </>
  );
}
