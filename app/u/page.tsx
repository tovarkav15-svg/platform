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
import { ChatAvatar } from "../messages/ChatAvatar";
import { tierOf } from "@/lib/aura";
import { chatHref } from "@/lib/links";
import { useRouter } from "next/navigation";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

type Channel = { chat_id: string; title: string; username: string | null; avatar: string | null; accent: string; emoji: string; description: string; member_count: number };
type JobLite = { id: string; service: string; niche: string; avg_check: number };
type Data = { user: Profile; earnings: Earnings | null; friends: number; state: FriendState | null; works: Work[]; projects: Project[]; aura: number; channels: Channel[]; jobs: JobLite[] };

export default function ProfilePage() {
  const sp = useSearchParams();
  const username = normalizeUsername(sp.get("n") ?? "");
  const { ready, me } = useSession();
  const [data, setData] = useState<Data | null | "missing">(null);

  const load = useCallback(async () => {
    const { data: user } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
    if (!user) return setData("missing");
    // Доход отдаёт сама база: владельцу всегда, остальным только если он открыт
    const [{ data: earnings }, { data: friends }, state, { data: works }, { data: projects }, { data: aura }, { data: channels }, { data: jobs }] = await Promise.all([
      supabase.from("earnings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("friend_count", { p_user: user.id }),
      me ? friendState(me.id, user.id) : Promise.resolve(null),
      supabase.from("works").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.rpc("my_aura", { p_user: user.id }),
      supabase.rpc("user_channels", { p_user: user.id }),
      supabase.from("jobs").select("id, service, niche, avg_check").eq("user_id", user.id).eq("active", true).order("updated_at", { ascending: false }),
    ]);
    setData({
      user: user as Profile, earnings: earnings as Earnings | null, friends: friends ?? 0, state,
      works: (works as Work[]) ?? [], projects: (projects as Project[]) ?? [],
      aura: (aura as number) ?? 0, channels: (channels as Channel[]) ?? [], jobs: (jobs as JobLite[]) ?? [],
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
      {data && data !== "missing" && data.user.page_bg !== "plain" && (
        <div className={`pf-aurora bg-${data.user.page_bg}`} aria-hidden="true" style={{ "--c": accentColor(data.user.accent) } as React.CSSProperties}><i /><i /></div>
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

function ProfileView({ user, earnings, friends, state, works, projects, aura, channels, jobs, tab, isMe, loggedIn, reload }: Data & { tab: string | null; isMe: boolean; loggedIn: boolean; reload: () => void }) {
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

  return (
    <>
      <ProfileHeader
        displayName={user.display_name} username={user.username} headline={user.headline} bio={user.bio}
        status={user.status} openToWork={user.open_to_work} accent={user.accent} avatar={user.avatar} role={user.role}
        banner={publicMedia(user.banner_path)} bannerPreset={user.banner_preset} userId={user.id} ring={user.avatar_ring} nameStyle={user.name_style} emoji={user.emoji} support={user.is_support}
        actions={isMe
          ? <Link className="btn" href="/settings/">Редактировать</Link>
          : loggedIn && state
            ? <FriendActions userId={user.id} state={state} onChange={reload} />
            : <Link className="btn" href="/login">Войти, чтобы написать</Link>}
        meta={
          <div className="ph2-links">
            {user.city && <span className="chip-soft">⌖ {user.city}</span>}
            {user.telegram && <a className="chip-soft" href={`https://t.me/${user.telegram}`} target="_blank" rel="noopener noreferrer">Telegram ↗</a>}
            {user.website && <a className="chip-soft" href={user.website} target="_blank" rel="noopener noreferrer nofollow">{user.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 32)} ↗</a>}
            <span className="chip-soft muted">С {since.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
        }
      />

      <div className="pf-stats">
        {stats.map((s, i) => {
          const inner = <><b className="mono"><CountUp value={s.n} /></b><span>{s.label}</span></>;
          return s.href
            ? <Link key={i} href={s.href} replace={s.href.startsWith("/u/")} scroll={false} className="pf-stat" style={{ "--i": i } as React.CSSProperties}>{inner}</Link>
            : <div key={i} className="pf-stat" style={{ "--i": i } as React.CSSProperties}>{inner}</div>;
        })}
      </div>

      <div className="pf-layout">
        <aside className="pf-side">
          <AuraCard aura={aura} isMe={isMe} />

          {user.is_support && (
            <section className="pf-card pf-support">
              <header><span className="pf-dot" /><b>Команда поддержки</b></header>
              <p className="pf-muted">{isMe ? "Ты в команде поддержки: обращения приходят тебе во вкладку «Обращения» в чатах." : `${user.display_name} из команды платформы. Если что-то не работает или есть идея, напиши в поддержку, ответим.`}</p>
              {!isMe && <SupportButton />}
            </section>
          )}

          {(user.looking_for || isMe) && (
            <section className="pf-card pf-looking">
              <header><span className="pf-dot" /><b>Ищу</b>{isMe && <Link href="/settings/#looking" className="link-btn">Изменить</Link>}</header>
              {user.looking_for ? <p className="pf-looking-text">{user.looking_for}</p> : <p className="pf-muted">Напиши, кого или что ищешь: команду, клиентов, наставника. Это видят все.</p>}
              {projects.filter((p) => p.looking_for).slice(0, 3).map((p) => (
                <Link key={p.id} href={`/project/?id=${p.id}`} className="pf-looking-proj"><b>{p.name}</b><span>{p.looking_for}</span></Link>
              ))}
            </section>
          )}

          {channels.length > 0 && (
            <section className="pf-card pf-channels">
              <header><span className="pf-dot" /><b>Каналы</b></header>
              <ul>
                {channels.map((c) => (
                  <li key={c.chat_id}>
                    <Link href={c.username ? `/c/?u=${c.username}` : "/messages/"} className="pf-channel">
                      <ChatAvatar size={40} c={{ kind: "channel", avatar: c.avatar, accent: c.accent, emoji: c.emoji, title: c.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
                      <span><b>{c.title}</b><small>{c.username ? `@${c.username} · ` : ""}{c.member_count} подписчиков</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {jobs.length > 0 && (
            <section className="pf-card pf-jobs">
              <header><span className="pf-dot" /><b>На бирже</b><Link href="/jobs/" className="link-btn">Биржа →</Link></header>
              {jobs.map((j) => (
                <div key={j.id} className="pf-job"><b>{j.service}</b><span className="mono">{j.avg_check ? `${Math.round(j.avg_check).toLocaleString("ru-RU").replace(/\u00a0/g, " ")} ₽` : "по договорённости"}</span></div>
              ))}
            </section>
          )}
          <section className="pf-card pf-about">
            <header><span className="pf-dot" /><b>О себе</b>{isMe && <Link href="/settings/#about" className="link-btn">Изменить</Link>}</header>
            {user.about ? (
              <div className="pf-about-text">{user.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            ) : (
              <p className="pf-muted">{isMe ? "Расскажи подробнее, чем занимаешься, с кем работал и что ищешь. Это видят все, кто открыл профиль." : "Пока ничего не рассказал о себе."}</p>
            )}
            {niches.length > 0 && (
              <div className="pf-tags">
                {niches.map((n) => <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>)}
              </div>
            )}
            {skills.length > 0 && (
              <div className="pf-skills">
                <span className="label">Навыки</span>
                <div className="tags">{skills.map((s, i) => <span key={s} className="skill" style={{ "--i": i } as React.CSSProperties}>{s}</span>)}</div>
              </div>
            )}
          </section>

          {earnings && (
            <section className="card money">
              <div className="label">{isMe ? "Сколько ты заработал" : "Заработал в этом месяце"}</div>
              <div className="sum"><CountUp value={earnings.amount} format={fmt} ms={900} /><span className="it">₽</span></div>
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
            <section className="pf-card pf-pinned">
              <header><span className="pf-dot" /><b>Сейчас строю</b></header>
              <ProjectCard project={pinned} pinned />
            </section>
          )}
        </aside>

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

function AuraCard({ aura, isMe }: { aura: number; isMe: boolean }) {
  const t = tierOf(aura);
  return (
    <Link href="/aura/" className="pf-aura" style={{ "--t": t.color } as React.CSSProperties}>
      <span className="pf-aura-orb" aria-hidden="true" />
      <span className="pf-aura-text">
        <span className="label">AURA · {t.name}</span>
        <b className="mono"><CountUp value={aura} /></b>
        {t.next
          ? <span className="pf-aura-next"><i style={{ width: `${Math.round(t.progress * 100)}%` }} /><em>{isMe ? `ещё ${t.next.min - aura} до «${t.next.name}»` : `до «${t.next.name}» ${t.next.min - aura}`}</em></span>
          : <span className="pf-aura-next"><em>Высший уровень</em></span>}
      </span>
    </Link>
  );
}

function SupportButton() {
  const router = useRouter();
  return (
    <button type="button" className="btn sm" onClick={async () => {
      const { data } = await supabase.rpc("open_support");
      if (data) router.push(chatHref(data as string));
    }}>Написать в поддержку</button>
  );
}
