"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, publicMedia, type Earnings, type FriendState, type Profile, type Project, type Work } from "@/lib/supabase";
import { friendState } from "@/lib/api";
import { useSession } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
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
import type { Deco } from "@/lib/shop";
import { PageFx } from "../Deco";
import { Reviews } from "../Reviews";
import { ReportDialog } from "../messages/ChatTools";
import { useLive } from "@/lib/live";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

type Channel = { chat_id: string; title: string; username: string | null; avatar: string | null; accent: string; emoji: string; description: string; member_count: number };
type JobLite = { id: string; service: string; niche: string; avg_check: number };
type Data = { user: Profile; earnings: Earnings | null; friends: number; state: FriendState | null; works: Work[]; projects: Project[]; aura: number; channels: Channel[]; jobs: JobLite[]; deco: Deco | null };

export default function ProfilePage() {
  const sp = useSearchParams();
  const username = normalizeUsername(sp.get("n") ?? "");
  const { ready, me } = useSession();
  const [data, setData] = useState<Data | null | "missing">(null);

  const load = useCallback(async () => {
    const { data: user } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
    if (!user) return setData("missing");
    // Доход отдаёт сама база: владельцу всегда, остальным только если он открыт
    const [{ data: earnings }, { data: friends }, state, { data: works }, { data: projects }, { data: aura }, { data: channels }, { data: jobs }, { data: deco }] = await Promise.all([
      supabase.from("earnings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("friend_count", { p_user: user.id }),
      me ? friendState(me.id, user.id) : Promise.resolve(null),
      supabase.from("works").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("projects").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.rpc("my_aura", { p_user: user.id }),
      supabase.rpc("user_channels", { p_user: user.id }),
      supabase.from("jobs").select("id, service, niche, avg_check").eq("user_id", user.id).eq("active", true).order("updated_at", { ascending: false }),
      supabase.from("profile_deco").select("user_id, banner, ring, name_fx, title, page_bg, overlay, scene").eq("user_id", user.id).maybeSingle(),
    ]);
    setData({
      user: user as Profile, earnings: earnings as Earnings | null, friends: friends ?? 0, state,
      works: (works as Work[]) ?? [], projects: (projects as Project[]) ?? [],
      aura: (aura as number) ?? 0, channels: (channels as Channel[]) ?? [], jobs: (jobs as JobLite[]) ?? [], deco: deco as Deco | null,
    });
  }, [username, me]);

  useEffect(() => {
    if (!ready) return;
    if (!username) return setData("missing");
    load();
  }, [ready, username, load]);
  useLive(["profiles", "works", "projects", "jobs", "profile_deco", "friendships"], () => { if (ready && username) load(); });

  useEffect(() => {
    if (data && data !== "missing") document.title = `${data.user.display_name} (@${data.user.username})`;
  }, [data]);

  return (
    <>
      <TopBar />
      {data && data !== "missing" && data.deco?.page_bg && <PageFx id={data.deco.page_bg} />}
      <main className="page wide px">
        {data === null && <><div className="skeleton pf-skeleton" /><div className="skeleton list-skeleton" /></>}
        {data === "missing" && (
          <div className="empty">
            <b className="caps">Профиль не найден</b>
            <p className="lead">Проверь юзернейм в ссылке.</p>
            <Link className="btn" href="/">На главную</Link>
          </div>
        )}
        {data && data !== "missing" && (
          <ProfileView {...data} tab={sp.get("tab")} isMe={me?.id === data.user.id} loggedIn={!!me} meId={me?.id ?? null} reload={load} />
        )}
      </main>
    </>
  );
}

function ProfileView({ user, earnings, friends, state, works, projects, aura, channels, jobs, deco, tab, isMe, loggedIn, meId, reload }: Data & { tab: string | null; isMe: boolean; loggedIn: boolean; meId: string | null; reload: () => void }) {
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
  // Переход из задания AURA: сразу открываем форму новой работы или проекта
  const wantNew = useSearchParams().get("new");
  useEffect(() => {
    if (!isMe) return;
    if (wantNew === "work") setWorkEdit("new");
    if (wantNew === "project") setProjectEdit("new");
  }, [wantNew, isMe]);

  const stats = [
    { n: works.length, label: plural(works.length, "работа", "работы", "работ"), href: profileHref(user.username, "work") },
    { n: projects.length, label: plural(projects.length, "проект", "проекта", "проектов"), href: profileHref(user.username, "projects") },
    { n: friends, label: plural(friends, "друг", "друга", "друзей"), href: isMe ? "/community/" : undefined },
    { n: days, label: `${plural(days, "день", "дня", "дней")} в Relic` },
  ];
  const site = user.website ? user.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 32) : "";

  return (
    <>
      <ProfileHeader
        displayName={user.display_name} username={user.username} headline={user.headline} bio={user.bio}
        status={user.status} openToWork={user.open_to_work} accent={user.accent} avatar={user.avatar} role={user.role}
        banner={publicMedia(user.banner_path)} bannerPreset={user.banner_preset} userId={user.id} ring={user.avatar_ring} nameStyle={user.name_style} emoji={user.emoji} support={user.is_support} deco={deco}
        actions={<>
          {isMe
            ? <Link className="btn" href="/settings/">Редактировать</Link>
            : loggedIn && state
              ? <FriendActions userId={user.id} state={state} onChange={reload} />
              : <Link className="btn" href="/login">Написать</Link>}
          <ShareButton username={user.username} />
        </>}
        meta={
          <div className="ph2-links">
            {user.city && <span className="px-fact">{user.city}</span>}
            {user.telegram && <a className="px-fact px-link" href={`https://t.me/${user.telegram}`} target="_blank" rel="noopener noreferrer">Telegram ↗</a>}
            {user.website && <a className="px-fact px-link" href={user.website} target="_blank" rel="noopener noreferrer nofollow">{site} ↗</a>}
            <span className="px-fact">В Relic с {since.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).split(" ")[1]} {since.getFullYear()}</span>
          </div>
        }
      />

      <section className="px-stats" aria-label="Цифры профиля">
        <AuraCard aura={aura} isMe={isMe} />
        {stats.map((s, i) => {
          const inner = <><b><CountUp value={s.n} /></b><span>{s.label}</span></>;
          return s.href
            ? <Link key={i} href={s.href} replace={s.href.startsWith("/u/")} scroll={false} className="px-stat">{inner}</Link>
            : <div key={i} className="px-stat">{inner}</div>;
        })}
      </section>

      <div className="px-grid">
        <div className="px-main">
          <section className="px-card">
            <header className="px-h"><h2>О себе</h2>{isMe && <Link href="/settings/#about" className="px-edit">Изменить</Link>}</header>
            {user.about ? (
              <div className="px-about">{user.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            ) : (
              <p className="px-muted">{isMe ? "Расскажи подробнее, чем занимаешься, с кем работал и что ищешь. Это видят все, кто открыл профиль." : "Пока ничего не рассказал о себе."}</p>
            )}
            {niches.length > 0 && (
              <div className="px-row">
                <span className="px-label">Направления</span>
                <div className="px-tags">{niches.map((n) => <span key={n.id} className="px-tag" style={{ "--c": n.color } as React.CSSProperties}><i />{n.title}</span>)}</div>
              </div>
            )}
            {skills.length > 0 && (
              <div className="px-row">
                <span className="px-label">Навыки</span>
                <div className="px-tags">{skills.map((s) => <span key={s} className="px-tag">{s}</span>)}</div>
              </div>
            )}
            {(user.looking_for || isMe) && (
              <div className="px-looking">
                <span className="px-label">Ищу{isMe && <Link href="/settings/#looking" className="px-edit">Изменить</Link>}</span>
                {user.looking_for ? <p>{user.looking_for}</p> : <p className="px-muted">Напиши, кого или что ищешь: команду, клиентов, наставника. Это видят все.</p>}
                {projects.some((p) => p.looking_for) && (
                  <div className="px-looking-list">
                    {projects.filter((p) => p.looking_for).slice(0, 3).map((p) => (
                      <Link key={p.id} href={`/project/?id=${p.id}`}><b>{p.name}</b><span>{p.looking_for}</span><em aria-hidden="true">→</em></Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {pinned && (
            <section className="px-card px-pinned">
              <header className="px-h"><h2>Сейчас строю</h2></header>
              <ProjectCard project={pinned} pinned />
            </section>
          )}

          <section className="px-card px-port">
            <header className="px-h">
              {sections.length > 1 ? (
                <nav className="px-tabs" aria-label="Разделы профиля">
                  {sections.map((s) => (
                    <Link key={s} href={profileHref(user.username, s)} replace scroll={false} className="px-tab" aria-current={active === s ? "page" : undefined}>
                      {s === "work" ? "Работы" : SECTION_TITLES[s].label}
                      {s === "work" && works.length > 0 && <em>{works.length}</em>}
                      {s === "projects" && projects.length > 0 && <em>{projects.length}</em>}
                    </Link>
                  ))}
                </nav>
              ) : <h2>{active === "work" ? "Работы" : SECTION_TITLES[active]?.label}</h2>}
              {isMe && active === "work" && <button type="button" className="btn sm" onClick={() => setWorkEdit("new")}>+ Работа</button>}
              {isMe && active === "projects" && <button type="button" className="btn sm" onClick={() => setProjectEdit("new")}>+ Проект</button>}
              {isMe && active === "goals" && <Link className="btn sm ghost" href="/workspace/?tab=plans&view=goals">Все мои цели</Link>}
            </header>

            {active === "work" && (
              works.length ? (
                <div className="pgrid px-pgrid" key="work">
                  {works.map((w, i) => <WorkCard key={w.id} work={w} i={i} onEdit={isMe ? () => setWorkEdit(w) : undefined} />)}
                </div>
              ) : <Empty isMe={isMe} text="Работ пока нет." meText="Покажи, что ты уже сделал: ролики, сайты, запуски. С цифрами, если есть." cta="Добавить первую работу" onCta={() => setWorkEdit("new")} />
            )}
            {active === "projects" && (
              projects.length ? (
                <div className="pgrid px-pgrid" key="projects">
                  {projects.map((p, i) => <ProjectCard key={p.id} project={p} i={i} pinned={p.id === user.pinned_project} onEdit={isMe ? () => setProjectEdit(p) : undefined} />)}
                </div>
              ) : <Empty isMe={isMe} text="Проектов пока нет." meText="Расскажи, что строишь сейчас. Можно на стадии идеи и сразу написать, кого ищешь в команду." cta="Добавить проект" onCta={() => setProjectEdit("new")} />
            )}
            {active === "goals" && (
              <div key="goals">
                <GoalsBoard userId={user.id} editable={false} />
                {isMe && <p className="px-muted px-note">Здесь видны только цели, которые ты отметил «Показать в профиле».</p>}
              </div>
            )}
          </section>

          <Reviews userId={user.id} meId={meId} name={user.display_name} />
        </div>

        <aside className="px-side">
          {jobs.length > 0 && (
            <section className="px-card px-services">
              <header className="px-h"><h2>Услуги</h2><Link href="/jobs/" className="px-edit">Биржа →</Link></header>
              <ul>
                {jobs.map((j) => (
                  <li key={j.id}><span>{j.service}</span><b>{j.avg_check ? `${fmt(j.avg_check)} ₽` : "договорная"}</b></li>
                ))}
              </ul>
            </section>
          )}
          {earnings && (
            <section className="px-card px-money">
              <span className="px-label">{isMe ? "Заработано за месяц" : "Заработал в этом месяце"}</span>
              <div className="px-sum"><CountUp value={earnings.amount} format={fmt} ms={900} /> ₽</div>
              {earnings.goal > 0 && (
                <>
                  <div className="px-bar"><b style={{ width: `${pct}%` }} /></div>
                  <div className="px-money-row"><span>Цель {fmt(earnings.goal)} ₽</span><span>{pct}%</span></div>
                </>
              )}
              {isMe && <span className="px-private">{earnings.is_public ? "Видят все" : "Видишь только ты"}</span>}
            </section>
          )}
          {channels.length > 0 && (
            <section className="px-card px-channels">
              <header className="px-h"><h2>Каналы</h2></header>
              <ul>
                {channels.map((c) => (
                  <li key={c.chat_id}>
                    <Link href={c.username ? `/c/?u=${c.username}` : "/messages/"}>
                      <ChatAvatar size={38} c={{ kind: "channel", avatar: c.avatar, accent: c.accent, emoji: c.emoji, title: c.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
                      <span><b>{c.title}</b><small>{c.username ? `@${c.username} · ` : ""}{c.member_count} {plural(c.member_count, "подписчик", "подписчика", "подписчиков")}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {user.is_support && (
            <section className="px-card px-support">
              <header className="px-h"><h2>Команда Relic</h2></header>
              <p className="px-muted">{isMe ? "Ты в команде поддержки: обращения приходят во вкладку «Обращения» в чатах." : `${user.display_name} из команды платформы. Что-то не работает или есть идея — напиши, ответим.`}</p>
              {!isMe && <SupportButton />}
            </section>
          )}
        </aside>
      </div>

      {!isMe && loggedIn && <ProfileSafety userId={user.id} name={user.display_name} username={user.username} />}

      {isMe && (
        <>
          <WorkEditor open={workEdit !== null} onClose={() => setWorkEdit(null)} userId={user.id} work={workEdit === "new" ? null : workEdit} onSaved={reload} />
          <ProjectEditor open={projectEdit !== null} onClose={() => setProjectEdit(null)} userId={user.id} project={projectEdit === "new" ? null : projectEdit} onSaved={reload} />
        </>
      )}
    </>
  );
}

function ShareButton({ username }: { username: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost px-share" aria-label="Скопировать ссылку на профиль" title="Скопировать ссылку на профиль" onClick={async () => {
      const url = `${location.origin}${location.pathname.replace(/\/u\/?$/, "/u/")}?n=${username}`;
      try { await navigator.clipboard.writeText(url); } catch { window.prompt("Ссылка на профиль", url); }
      setDone(true); setTimeout(() => setDone(false), 1600);
    }}>{done ? "✓ Скопировано" : "Поделиться"}</button>
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
    <Link href="/aura/" className="px-stat px-aura" style={{ "--t": t.color } as React.CSSProperties}>
      <b><CountUp value={aura} /></b>
      <span>AURA · {t.fullName}</span>
      {t.next
        ? <span className="px-aura-bar" title={t.stepNext ? (isMe ? `ещё ${t.stepNext - aura} до следующей ступени` : `до следующей ступени ${t.stepNext - aura}`) : ""}><i style={{ width: `${Math.round(t.stepProgress * 100)}%` }} /></span>
        : <span className="px-aura-bar full"><i style={{ width: "100%" }} /></span>}
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

/** Внизу чужого профиля: пожаловаться модераторам или заблокировать */
function ProfileSafety({ userId, name, username }: { userId: string; name: string; username: string }) {
  const { me } = useSession();
  const [report, setReport] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  useEffect(() => { supabase.from("blocks").select("blocked").eq("blocked", userId).maybeSingle().then(({ data }) => setBlocked(!!data)); }, [userId]);
  async function toggle() {
    if (blocked) await supabase.from("blocks").delete().eq("blocked", userId);
    else {
      if (!window.confirm(`Заблокировать ${name}? Он не сможет писать и звонить тебе.`)) return;
      await supabase.from("blocks").insert({ blocked: userId });
    }
    setBlocked(!blocked);
  }
  return (
    <div className="pf-safety">
      {(me?.role === "owner" || me?.role === "founder") && <Link className="link-btn md-shield" href={`/moderation/?tab=users&u=${username}`}>🛡 Модерация</Link>}
      <button type="button" className="link-btn" onClick={() => setReport(true)}>⚑ Пожаловаться</button>
      {blocked !== null && <button type="button" className="link-btn" onClick={toggle}>{blocked ? "↺ Разблокировать" : "⊘ Заблокировать"}</button>}
      <ReportDialog target={report ? userId : null} name={name} onClose={() => setReport(false)} />
    </div>
  );
}
