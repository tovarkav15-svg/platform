"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase, publicMedia, type Earnings, type FriendState, type Profile, type Project, type Work } from "@/lib/supabase";
import { friendState } from "@/lib/api";
import { useSession } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
import { accentColor } from "@/lib/style";
import { profileHref } from "@/lib/links";
import { normalizeUsername } from "@/lib/username";
import { SECTION_TITLES } from "@/lib/sections";
import { ProfileHeader } from "../ProfileHeader";
import { TopBar } from "../TopBar";
import { FriendActions } from "../FriendActions";
import { ProjectCard, WorkCard } from "../Cards";
import { WorkEditor } from "../work/WorkEditor";
import { ProjectEditor } from "../project/ProjectEditor";
import { GoalsBoard } from "../goals/GoalsBoard";
import { CountUp } from "../CountUp";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
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
      {data && data !== "missing" && (
        <div className="pf-aurora" aria-hidden="true" style={{ "--c": accentColor(data.user.accent) } as React.CSSProperties}><i /><i /></div>
      )}
      <main className="page wide pf">
        {data === null && <><div className="skeleton pf-skeleton" /><div className="skeleton list-skeleton" /></>}
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
  const since = new Date(user.created_at);
  const days = Math.max(1, Math.round((Date.now() - since.getTime()) / 86400000));
  const pct = earnings?.goal ? Math.min(100, Math.round((earnings.amount / earnings.goal) * 100)) : 0;

  const sections = user.sections.split(",").filter((s) => s in SECTION_TITLES);
  const active = tab && sections.includes(tab) ? tab : sections[0];
  const pinned = projects.find((p) => p.id === user.pinned_project);

  const [workEdit, setWorkEdit] = useState<Work | null | "new">(null);
  const [projectEdit, setProjectEdit] = useState<Project | null | "new">(null);

  // Подсветка активной вкладки едет за ней
  const tabsRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = tabsRef.current?.querySelector<HTMLElement>(`[data-s="${active}"]`);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, works.length, projects.length]);

  const stats = [
    { n: works.length, label: plural(works.length, "работа", "работы", "работ"), href: profileHref(user.username, "work") },
    { n: projects.length, label: plural(projects.length, "проект", "проекта", "проектов"), href: profileHref(user.username, "projects") },
    { n: friends, label: plural(friends, "друг", "друга", "друзей"), href: isMe ? "/community/" : undefined },
    { n: days, label: `${plural(days, "день", "дня", "дней")} на платформе` },
  ];

  const socials = [
    user.telegram && { label: "Telegram", value: "@" + user.telegram, href: `https://t.me/${user.telegram}` },
    user.website && { label: "Сайт", value: user.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 28), href: user.website },
    user.city && { label: "Город", value: user.city },
  ].filter(Boolean) as { label: string; value: string; href?: string }[];

  return (
    <>
      <div className="bento">
        <div className="bt bt-id" style={{ "--i": 0 } as React.CSSProperties}>
          <ProfileHeader
            displayName={user.display_name} username={user.username} headline={user.headline} bio={user.bio}
            status={user.status} openToWork={user.open_to_work} accent={user.accent} avatar={user.avatar} role={user.role}
            banner={publicMedia(user.banner_path)} bannerPreset={user.banner_preset}
            actions={isMe
              ? <Link className="btn" href="/settings/">Редактировать</Link>
              : loggedIn && state
                ? <FriendActions userId={user.id} state={state} onChange={reload} />
                : <Link className="btn" href="/login">Войти, чтобы написать</Link>}
          />
        </div>

        <div className="bt bt-stats" style={{ "--i": 1 } as React.CSSProperties}>
          {stats.map((s, i) => {
            const inner = <><b className="mono"><CountUp value={s.n} /></b><span>{s.label}</span></>;
            return s.href
              ? <Link key={i} href={s.href} replace={s.href.startsWith("/u/")} scroll={false} className="bt-stat">{inner}</Link>
              : <div key={i} className="bt-stat">{inner}</div>;
          })}
        </div>

        <section className="bt bt-about" style={{ "--i": 2 } as React.CSSProperties}>
          <header><b>О себе</b>{isMe && <Link href="/settings/#about" className="link-btn">Изменить</Link>}</header>
          {user.about ? (
            <div className="pf-about-text">{user.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
          ) : (
            <p className="pf-muted">{isMe ? "Расскажи подробнее, чем занимаешься, с кем работал и что ищешь." : "Пока ничего не рассказал о себе."}</p>
          )}
        </section>

        {earnings ? (
          <section className="bt bt-money" style={{ "--i": 3 } as React.CSSProperties}>
            <header><b>{isMe ? "Заработал" : "Доход за месяц"}</b>{isMe && <span className="bt-lock">{earnings.is_public ? "◉ видят все" : "◎ только ты"}</span>}</header>
            <div className="bt-sum mono"><CountUp value={earnings.amount} format={fmt} ms={900} /><em>₽</em></div>
            {earnings.goal > 0 && (
              <div className="bt-goal">
                <svg viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"><rect width="120" height="8" rx="4" className="bt-goal-bg" /><rect width={1.2 * pct} height="8" rx="4" className="bt-goal-fg" /></svg>
                <span>{pct}% от {fmt(earnings.goal)} ₽</span>
              </div>
            )}
          </section>
        ) : (
          <section className="bt bt-since" style={{ "--i": 3 } as React.CSSProperties}>
            <header><b>На платформе</b></header>
            <div className="bt-sum mono">{since.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}<em>{since.getFullYear()}</em></div>
          </section>
        )}

        <section className="bt bt-tags" style={{ "--i": 4 } as React.CSSProperties}>
          <header><b>Ниши и навыки</b></header>
          {niches.length || skills.length ? (
            <div className="bt-cloud">
              {niches.map((n, i) => <span key={n.id} className="bt-niche" style={{ "--c": n.color, "--k": i } as React.CSSProperties}><i />{n.title}</span>)}
              {skills.map((s, i) => <span key={s} className="bt-skill" style={{ "--k": i + niches.length } as React.CSSProperties}>{s}</span>)}
            </div>
          ) : <p className="pf-muted">{isMe ? <>Не выбраны. <Link href="/settings/">Добавить</Link></> : "Не указаны."}</p>}
        </section>

        <section className="bt bt-links" style={{ "--i": 5 } as React.CSSProperties}>
          <header><b>Связь</b></header>
          {socials.length ? (
            <ul>
              {socials.map((x) => (
                <li key={x.label}>
                  <span>{x.label}</span>
                  {x.href ? <a href={x.href} target="_blank" rel="noopener noreferrer nofollow">{x.value} ↗</a> : <b>{x.value}</b>}
                </li>
              ))}
            </ul>
          ) : <p className="pf-muted">{isMe ? <>Добавь Telegram и сайт в <Link href="/settings/">настройках</Link>.</> : "Контакты не указаны."}</p>}
        </section>

        {pinned && (
          <section className="bt bt-pinned" style={{ "--i": 6 } as React.CSSProperties}>
            <header><b>Сейчас строю</b></header>
            <ProjectCard project={pinned} pinned />
          </section>
        )}
      </div>

      <div className="pf-sections">
        <section className="pf-main">
          {sections.length > 1 && (
            <nav className="pf-tabs" ref={tabsRef} aria-label="Разделы профиля">
              {pill && <span className="pf-tabs-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} />}
              {sections.map((s) => (
                <Link key={s} data-s={s} href={profileHref(user.username, s)} replace scroll={false} className="pf-tab" aria-current={active === s ? "page" : undefined}>
                  {SECTION_TITLES[s].label}
                  {s === "work" && works.length > 0 && <em>{works.length}</em>}
                  {s === "projects" && projects.length > 0 && <em>{projects.length}</em>}
                </Link>
              ))}
            </nav>
          )}

          {active === "work" && (
            <div className="section-block" key="work">
              <div className="section-head">
                <div><h2 className="h-md caps">Proof <span className="it">of</span> Work</h2><span className="pf-sub">Что уже сделано, с цифрами</span></div>
                {isMe && <button type="button" className="btn sm" onClick={() => setWorkEdit("new")}>+ Работа</button>}
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
                <div><h2 className="h-md caps">Что <span className="it">строю</span></h2><span className="pf-sub">Проекты, цели и команда</span></div>
                {isMe && <button type="button" className="btn sm" onClick={() => setProjectEdit("new")}>+ Проект</button>}
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
                <div><h2 className="h-md caps">К чему <span className="it">иду</span></h2><span className="pf-sub">Открытые цели</span></div>
                {isMe && <Link className="btn sm" href="/workspace/?tab=plans&view=goals">Все мои цели</Link>}
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
    <div className="pf-empty">
      <span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span>
      <p className="lead">{isMe ? meText : text}</p>
      {isMe && <button type="button" className="btn" onClick={onCta}>{cta}</button>}
    </div>
  );
}
