"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Earnings, type FriendState, type Profile, type Project, type Work } from "@/lib/supabase";
import { friendState } from "@/lib/api";
import { useSession } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { normalizeUsername } from "@/lib/username";
import { ProfileHeader } from "../ProfileHeader";
import { TopBar } from "../TopBar";
import { FriendActions } from "../FriendActions";
import { ProjectCard, WorkCard } from "../Cards";
import { WorkEditor } from "../work/WorkEditor";
import { ProjectEditor } from "../project/ProjectEditor";
import { GoalsBoard } from "../goals/GoalsBoard";
import { SECTION_TITLES } from "@/lib/sections";

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

type Data = { user: Profile; earnings: Earnings | null; friends: number; state: FriendState | null; works: Work[]; projects: Project[] };

export default function ProfilePage() {
  const sp = useSearchParams();
  const username = normalizeUsername(sp.get("n") ?? "");
  const { ready, me } = useSession();
  const [data, setData] = useState<Data | null | "missing">(null);

  const load = useCallback(async () => {
    const { data: user } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
    if (!user) return setData("missing");
    // Доход отдаёт сама база: владельцу всегда, остальным только если он открыт
    const [{ data: earnings }, { data: friends }, state, { data: works }, { data: projects }] = await Promise.all([
      supabase.from("earnings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("friend_count", { p_user: user.id }),
      me ? friendState(me.id, user.id) : Promise.resolve(null),
      supabase.from("works").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    ]);
    setData({
      user: user as Profile, earnings: earnings as Earnings | null, friends: friends ?? 0, state,
      works: (works as Work[]) ?? [], projects: (projects as Project[]) ?? [],
    });
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
      <main className="page wide">
        {data === null && <div className="skeleton profile-skeleton" />}
        {data === "missing" && (
          <div className="empty">
            <b className="caps">Профиль не найден</b>
            <p className="lead">Проверь юзернейм в ссылке.</p>
            <Link className="btn" href="/">На главную</Link>
          </div>
        )}
        {data && data !== "missing" && (
          <ProfileView {...data} tab={sp.get("tab")} isMe={me?.id === data.user.id} loggedIn={!!me} reload={load} />
        )}
      </main>
    </>
  );
}

function ProfileView({ user, earnings, friends, state, works, projects, tab, isMe, loggedIn, reload }: Data & { tab: string | null; isMe: boolean; loggedIn: boolean; reload: () => void }) {
  const niches = parseNiches(user.niches);
  const skills = user.skills.split(",").map((s) => s.trim()).filter(Boolean);
  const since = new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const pct = earnings?.goal ? Math.min(100, Math.round((earnings.amount / earnings.goal) * 100)) : 0;

  const sections = user.sections.split(",").filter((s) => s in SECTION_TITLES);
  const active = tab && sections.includes(tab) ? tab : sections[0];
  const counts: Record<string, number> = { work: works.length, projects: projects.length };
  const pinned = projects.find((p) => p.id === user.pinned_project);

  const [workEdit, setWorkEdit] = useState<Work | null | "new">(null);
  const [projectEdit, setProjectEdit] = useState<Project | null | "new">(null);

  return (
    <>
      <ProfileHeader
        displayName={user.display_name} username={user.username} headline={user.headline} bio={user.bio}
        status={user.status} openToWork={user.open_to_work}
        accent={user.accent} cover={user.cover} avatar={user.avatar} role={user.role}
        meta={
          <div className="links">
            {user.city && <span className="label">{user.city}</span>}
            <span className="label">С {since}</span>
            <Link href={isMe ? "/community/" : profileHref(user.username)} className="label">{friends} {plural(friends, "друг", "друга", "друзей")}</Link>
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

      <div className="profile-layout">
        <aside className="profile-side">
          {earnings && (
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
          )}

          {pinned && (
            <section className="card">
              <div className="label">Сейчас строю</div>
              <ProjectCard project={pinned} pinned />
            </section>
          )}

          <section className="card">
            <div className="label">Ниши</div>
            {niches.length ? (
              <div className="tags">{niches.map((n) => <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>)}</div>
            ) : (
              <p className="lead small">{isMe ? <>Не выбраны. <Link href="/settings/">Выбрать</Link></> : "Не выбраны."}</p>
            )}
            {skills.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 6 }}>Навыки</div>
                <div className="tags">{skills.map((s) => <span key={s} className="skill">{s}</span>)}</div>
              </>
            )}
          </section>
        </aside>

        <section className="profile-main">
          {sections.length > 1 && (
            <nav className="seg" aria-label="Разделы профиля">
              {sections.map((s) => (
                <Link key={s} href={profileHref(user.username, s)} replace scroll={false} className="seg-item" aria-current={active === s ? "page" : undefined}>
                  {SECTION_TITLES[s].label}
                  {counts[s] !== undefined && counts[s] > 0 && <span className="count-plain">{counts[s]}</span>}
                </Link>
              ))}
            </nav>
          )}

          {active === "work" && (
            <div className="section-block" key="work">
              <div className="section-head">
                <h2 className="h-md caps">Proof <span className="it">of</span> Work</h2>
                {isMe && <button type="button" className="btn sm" onClick={() => setWorkEdit("new")}>Добавить работу</button>}
              </div>
              {works.length ? (
                <div className="pgrid">
                  {works.map((w, i) => <WorkCard key={w.id} work={w} i={i} onEdit={isMe ? () => setWorkEdit(w) : undefined} />)}
                </div>
              ) : (
                <Empty isMe={isMe} text="Работ пока нет." meText="Покажи, что ты уже сделал: ролики, сайты, запуски. С цифрами, если есть." cta="Добавить первую работу" onCta={() => setWorkEdit("new")} />
              )}
            </div>
          )}

          {active === "projects" && (
            <div className="section-block" key="projects">
              <div className="section-head">
                <h2 className="h-md caps">Что <span className="it">строю</span></h2>
                {isMe && <button type="button" className="btn sm" onClick={() => setProjectEdit("new")}>Новый проект</button>}
              </div>
              {projects.length ? (
                <div className="pgrid">
                  {projects.map((p, i) => (
                    <ProjectCard key={p.id} project={p} i={i} pinned={p.id === user.pinned_project} onEdit={isMe ? () => setProjectEdit(p) : undefined} />
                  ))}
                </div>
              ) : (
                <Empty isMe={isMe} text="Проектов пока нет." meText="Расскажи, что строишь сейчас. Можно на стадии идеи и сразу написать, кого ищешь в команду." cta="Добавить проект" onCta={() => setProjectEdit("new")} />
              )}
            </div>
          )}

          {active === "goals" && (
            <div className="section-block" key="goals">
              <div className="section-head">
                <h2 className="h-md caps">К чему <span className="it">иду</span></h2>
                {isMe && <Link className="btn sm" href="/goals/">Все мои цели</Link>}
              </div>
              <GoalsBoard userId={user.id} editable={false} />
              {isMe && <p className="hint">Здесь видны только цели, которые ты отметил «Показать в профиле».</p>}
            </div>
          )}
        </section>
      </div>

      {isMe && (
        <>
          <WorkEditor open={workEdit !== null} onClose={() => setWorkEdit(null)} userId={user.id} work={workEdit === "new" ? null : workEdit} onSaved={reload} />
          <ProjectEditor open={projectEdit !== null} onClose={() => setProjectEdit(null)} userId={user.id} project={projectEdit === "new" ? null : projectEdit} onSaved={reload} />
        </>
      )}
    </>
  );
}

function Empty({ isMe, text, meText, cta, onCta }: { isMe: boolean; text: string; meText: string; cta: string; onCta: () => void }) {
  return (
    <div className="empty">
      <p className="lead">{isMe ? meText : text}</p>
      {isMe && <button type="button" className="btn" onClick={onCta}>{cta}</button>}
    </div>
  );
}
