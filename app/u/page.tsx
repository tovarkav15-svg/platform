"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase, publicMedia, isOwner, STAGES, type Earnings, type FriendState, type Profile, type Project, type Work } from "@/lib/supabase";
import { friendState } from "@/lib/api";
import { useSession } from "@/lib/session";
import { parseNiches } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { normalizeUsername } from "@/lib/username";
import { SECTION_TITLES } from "@/lib/sections";
import { Banner } from "../ProfileHeader";
import { PresenceDot, PresenceLabel } from "../Avatar";
import { BannerFx, RingFx, TitleChip } from "../Deco";
import { accentColor } from "@/lib/style";
import { TopBar } from "../TopBar";
import { FriendActions } from "../FriendActions";
import { ProjectCard, WorkCard } from "../Cards";
import { WorkEditor } from "../work/WorkEditor";
import { ProjectEditor } from "../project/ProjectEditor";
import { GoalsBoard } from "../goals/GoalsBoard";
import { CountUp } from "../CountUp";
import { ChatAvatar } from "../messages/ChatAvatar";
import { tierOf } from "@/lib/aura";
import { chatHref, projectHref } from "@/lib/links";
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
      <main className="page wide xpage">
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
  const lookingProjects = projects.filter((p) => p.looking_for).slice(0, 3);
  const site = user.website ? user.website.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 32) : "";
  const sinceText = `${since.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).split(" ")[1]} ${since.getFullYear()}`;

  const [workEdit, setWorkEdit] = useState<Work | null | "new">(null);
  const [projectEdit, setProjectEdit] = useState<Project | null | "new">(null);
  const wantNew = useSearchParams().get("new");
  useEffect(() => {
    if (!isMe) return;
    if (wantNew === "work") setWorkEdit("new");
    if (wantNew === "project") setProjectEdit("new");
  }, [wantNew, isMe]);

  const root = useReveal([works.length, projects.length, active]);
  const cover = useParallax();

  const stats = [
    { n: works.length, label: plural(works.length, "работа", "работы", "работ"), href: profileHref(user.username, "work") },
    { n: projects.length, label: plural(projects.length, "проект", "проекта", "проектов"), href: profileHref(user.username, "projects") },
    { n: friends, label: plural(friends, "друг", "друга", "друзей"), href: isMe ? "/community/" : undefined },
    { n: days, label: `${plural(days, "день", "дня", "дней")} в Relic` },
  ];
  const showLooking = !!user.looking_for || lookingProjects.length > 0 || isMe;
  let k = 0; // порядок появления блоков

  return (
    <div className="xp" ref={root} style={{ "--c": accentColor(user.accent) } as React.CSSProperties}>
      {/* ===== Карточка человека: слева, остаётся на месте при прокрутке ===== */}
      <aside className="xc">
        <div className="xc-card">
          <div className="xc-cover" ref={cover}>
            <Banner image={publicMedia(user.banner_path)} preset={user.banner_preset} scene={deco?.scene} overlay={deco?.overlay} />
            <BannerFx id={deco?.banner} />
          </div>
          <div className="xc-top">
            <div className={`xh-ava ring-${user.avatar_ring || "spin"}`}>
              <span className="xh-ring" />
              <RingFx id={deco?.ring} />
              <div className="avatar">{user.avatar ? <img src={user.avatar} alt="" /> : (user.display_name || user.username).slice(0, 1).toUpperCase()}</div>
              <span className="xh-pres"><PresenceDot userId={user.id} size={128} /></span>
            </div>
            <ShareButton username={user.username} />
          </div>
          <div className="xc-id">
            <h1 className={`xc-name name-${user.name_style || "plain"} ${deco?.name_fx ? `fx-name ${deco.name_fx}` : ""}`} data-text={user.display_name}>{user.display_name}</h1>
            {user.emoji && <span className="xc-emoji" aria-hidden="true">{user.emoji}</span>}
          </div>
          <p className="xc-sub">@{user.username}{user.headline && <> · <b>{user.headline}</b></>}</p>
          {(user.open_to_work || isOwner(user.role) || user.is_support || deco?.title) && (
            <div className="xc-badges">
              {user.open_to_work && <span className="xh-otw"><i />Открыт к работе</span>}
              {isOwner(user.role) && <span className="xh-badge">Owner</span>}
              {user.is_support && <span className="xh-badge">Команда Relic</span>}
              <TitleChip id={deco?.title} />
            </div>
          )}
          {user.status && <p className="xc-now"><i />{user.status}</p>}
          {user.bio && <p className="xc-bio">{user.bio}</p>}
          <div className="xc-actions">
            {isMe
              ? <Link className="btn" href="/settings/">Редактировать профиль</Link>
              : loggedIn && state
                ? <FriendActions userId={user.id} state={state} onChange={reload} />
                : <Link className="btn" href="/login">Написать</Link>}
          </div>
          <div className="xc-stats">
            {stats.map((s, i) => {
              const inner = <><b><CountUp value={s.n} ms={1000} /></b><span>{s.label}</span></>;
              return s.href
                ? <Link key={i} href={s.href} replace={s.href.startsWith("/u/")} scroll={false}>{inner}</Link>
                : <div key={i}>{inner}</div>;
            })}
          </div>
          <AuraRow aura={aura} isMe={isMe} />
          <ul className="xc-meta">
            <li><PresenceLabel userId={user.id} /></li>
            {user.city && <li><span aria-hidden="true">⌖</span>{user.city}</li>}
            {user.telegram && <li><span aria-hidden="true">✈</span><a href={`https://t.me/${user.telegram}`} target="_blank" rel="noopener noreferrer">@{user.telegram}</a></li>}
            {user.website && <li><span aria-hidden="true">↗</span><a href={user.website} target="_blank" rel="noopener noreferrer nofollow">{site}</a></li>}
            <li><span aria-hidden="true">◷</span>В Relic с {sinceText}</li>
          </ul>
          {channels.length > 0 && (
            <div className="xc-extra">
              <span className="xc-extra-h">{channels.length > 1 ? "Каналы" : "Канал"}</span>
              {channels.map((c) => (
                <Link key={c.chat_id} href={c.username ? `/c/?u=${c.username}` : "/messages/"} className="xc-chan">
                  <ChatAvatar size={30} c={{ kind: "channel", avatar: c.avatar, accent: c.accent, emoji: c.emoji, title: c.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
                  <span><b>{c.title}</b><small>{c.member_count} {plural(c.member_count, "подписчик", "подписчика", "подписчиков")}</small></span>
                  <em aria-hidden="true">→</em>
                </Link>
              ))}
            </div>
          )}
          {user.is_support && !isMe && (
            <div className="xc-extra">
              <span className="xc-extra-h">Из команды Relic</span>
              <SupportButton />
            </div>
          )}
        </div>
        {!isMe && loggedIn && <ProfileSafety userId={user.id} name={user.display_name} username={user.username} />}
      </aside>

      {/* ===== Справа: содержимое ===== */}
      <div className="xm" onPointerMove={spotlight}>
        <section className="xt" data-r style={{ "--i": k++ } as React.CSSProperties}>
          <header className="xt-h"><span>О себе</span>{isMe && <Link href="/settings/#about">Изменить</Link>}</header>
          {user.about
            ? <div className="xt-text">{user.about.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
            : <p className="xt-muted">{isMe ? "Расскажи, чем занимаешься, с кем работал и что ищешь. Это первое, что читают в профиле." : "Пока ничего не рассказал о себе."}</p>}
          {(niches.length > 0 || skills.length > 0) && (
            <div className="xt-chips">
              {niches.map((n) => <span key={n.id} className="xchip" style={{ "--n": n.color } as React.CSSProperties}><i />{n.title}</span>)}
              {skills.map((s) => <span key={s} className="xchip ghost">{s}</span>)}
            </div>
          )}
        </section>

        {showLooking && (
          <section className="xt t-looking" data-r style={{ "--i": k++ } as React.CSSProperties}>
            <span className="t-looking-blob" aria-hidden="true" />
            <div className="t-looking-main">
              <span className="t-looking-label">Ищу{isMe && <Link href="/settings/#looking">Изменить</Link>}</span>
              <p className="t-looking-text">{user.looking_for || (isMe ? "Напиши, кого ищешь: команду, клиентов, наставника" : "Открыт к предложениям")}</p>
            </div>
            {lookingProjects.length > 0 && (
              <div className="t-looking-list">
                {lookingProjects.map((p) => <Link key={p.id} href={`/project/?id=${p.id}`}><b>{p.name}</b><span>{p.looking_for}</span><em aria-hidden="true">→</em></Link>)}
              </div>
            )}
          </section>
        )}

        {(jobs.length > 0 || earnings) && (
          <div className="xm-pair">
            {jobs.length > 0 && (
              <section className="xt t-services" data-r style={{ "--i": k++ } as React.CSSProperties}>
                <header className="xt-h"><span>Услуги</span><Link href="/jobs/">Все на Бирже →</Link></header>
                <div className="t-svc">
                  {jobs.map((j) => <div key={j.id} className="t-svc-item"><span>{j.service}</span><b>{j.avg_check ? <>{fmt(j.avg_check)} <small>₽</small></> : "договорная"}</b></div>)}
                </div>
              </section>
            )}
            {earnings && (
              <section className="xt t-money" data-r style={{ "--i": k++, "--p": `${pct}%` } as React.CSSProperties}>
                <header className="xt-h"><span>{isMe ? "Заработано за месяц" : "Заработал за месяц"}</span>{isMe && <em>{earnings.is_public ? "видят все" : "только ты"}</em>}</header>
                <div className="t-money-sum"><CountUp value={earnings.amount} format={fmt} ms={1200} /><small>₽</small></div>
                {earnings.goal > 0 && <><div className="t-money-bar"><b /></div><div className="t-money-row"><span>Цель {fmt(earnings.goal)} ₽</span><span>{pct}%</span></div></>}
              </section>
            )}
          </div>
        )}

        {pinned && (
          <Link href={projectHref(pinned.id)} className="xt t-pinned" data-r style={{ "--i": k++ } as React.CSSProperties}>
            <span className="t-pin-img">{publicMedia(pinned.image_path) ? <img src={publicMedia(pinned.image_path)!} alt="" /> : <b>{pinned.name.slice(0, 1)}</b>}</span>
            <span className="t-pin-body">
              <small>Сейчас строю · {STAGES[pinned.stage]}</small>
              <b>{pinned.name}</b>
              {pinned.tagline && <span>{pinned.tagline}</span>}
              {pinned.looking_for && <em>Ищу: {pinned.looking_for}</em>}
            </span>
            <i aria-hidden="true">→</i>
          </Link>
        )}

        {/* ===== Работы / проекты / цели ===== */}
      <section className="xs" data-r style={{ "--i": 0 } as React.CSSProperties}>
        <header className="xs-h">
          {sections.length > 1 ? (
            <Tabs active={active} items={sections.map((s) => ({
              id: s, href: profileHref(user.username, s),
              label: s === "work" ? "Работы" : SECTION_TITLES[s].label,
              n: s === "work" ? works.length : s === "projects" ? projects.length : 0,
            }))} />
          ) : <h2>{active === "work" ? "Работы" : SECTION_TITLES[active]?.label}</h2>}
          {isMe && active === "work" && <button type="button" className="btn sm" onClick={() => setWorkEdit("new")}>+ Работа</button>}
          {isMe && active === "projects" && <button type="button" className="btn sm" onClick={() => setProjectEdit("new")}>+ Проект</button>}
          {isMe && active === "goals" && <Link className="btn sm ghost" href="/workspace/?tab=plans&view=goals">Все мои цели</Link>}
        </header>
        <div className="xs-body" key={active}>
          {active === "work" && (works.length
            ? <div className="pgrid xs-grid">{works.map((w, i) => <WorkCard key={w.id} work={w} i={i} onEdit={isMe ? () => setWorkEdit(w) : undefined} />)}</div>
            : <Empty isMe={isMe} text="Работ пока нет." meText="Покажи, что ты уже сделал: ролики, сайты, запуски. С цифрами, если есть." cta="Добавить первую работу" onCta={() => setWorkEdit("new")} />)}
          {active === "projects" && (projects.length
            ? <div className="pgrid xs-grid">{projects.map((p, i) => <ProjectCard key={p.id} project={p} i={i} pinned={p.id === user.pinned_project} onEdit={isMe ? () => setProjectEdit(p) : undefined} />)}</div>
            : <Empty isMe={isMe} text="Проектов пока нет." meText="Расскажи, что строишь сейчас. Можно на стадии идеи и сразу написать, кого ищешь в команду." cta="Добавить проект" onCta={() => setProjectEdit("new")} />)}
          {active === "goals" && (
            <>
              <GoalsBoard userId={user.id} editable={false} />
              {isMe && <p className="xt-muted xs-note">Здесь видны только цели, которые ты отметил «Показать в профиле».</p>}
            </>
          )}
        </div>
      </section>

      <div className="xr" data-r style={{ "--i": 0 } as React.CSSProperties}>
        <Reviews userId={user.id} meId={meId} name={user.display_name} />
      </div>

      </div>

      {isMe && (
        <>
          <WorkEditor open={workEdit !== null} onClose={() => setWorkEdit(null)} userId={user.id} work={workEdit === "new" ? null : workEdit} onSaved={reload} />
          <ProjectEditor open={projectEdit !== null} onClose={() => setProjectEdit(null)} userId={user.id} project={projectEdit === "new" ? null : projectEdit} onSaved={reload} />
        </>
      )}
    </div>
  );
}

/** Плитки проявляются, когда до них доходит прокрутка */
function useReveal(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-r]:not([data-in]), .xs-grid > *:not([data-in])"));
    if (!("IntersectionObserver" in window)) { items.forEach((n) => n.setAttribute("data-in", "")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.setAttribute("data-in", ""); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
    items.forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Обложка чуть медленнее страницы при прокрутке */
function useParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => el.style.setProperty("--py", `${Math.min(window.scrollY, 400) * 0.18}px`)); };
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

/** Мягкий свет следует за курсором по плитке */
function spotlight(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const t = (e.target as HTMLElement).closest<HTMLElement>(".xt");
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty("--mx", `${e.clientX - r.left}px`);
  t.style.setProperty("--my", `${e.clientY - r.top}px`);
}

/** Вкладки с подложкой, которая переезжает к выбранной */
function Tabs({ active, items }: { active: string; items: { id: string; href: string; label: string; n: number }[] }) {
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLElement>(`[data-s="${active}"]`);
      if (a) setPill({ x: a.offsetLeft, w: a.offsetWidth });
    };
    place();
    document.fonts?.ready.then(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, items.length]);
  return (
    <nav className="xs-tabs" ref={nav} aria-label="Разделы профиля">
      {pill && <span className="xs-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {items.map((t) => (
        <Link key={t.id} data-s={t.id} href={t.href} replace scroll={false} className="xs-tab" aria-current={active === t.id ? "page" : undefined}>
          {t.label}{t.n > 0 && <em>{t.n}</em>}
        </Link>
      ))}
    </nav>
  );
}

function ShareButton({ username }: { username: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost xh-share" title="Скопировать ссылку на профиль" onClick={async () => {
      const url = `${location.origin}${location.pathname}?n=${username}`;
      try { await navigator.clipboard.writeText(url); } catch { window.prompt("Ссылка на профиль", url); }
      setDone(true); setTimeout(() => setDone(false), 1600);
    }}>{done ? "✓ Скопировано" : "Поделиться"}</button>
  );
}

function Empty({ isMe, text, meText, cta, onCta }: { isMe: boolean; text: string; meText: string; cta: string; onCta: () => void }) {
  return (
    <div className="xs-empty">
      <span className="xs-empty-art" aria-hidden="true"><i /><i /><i /></span>
      <p>{isMe ? meText : text}</p>
      {isMe && <button type="button" className="btn" onClick={onCta}>{cta}</button>}
    </div>
  );
}

/** AURA: строка с уровнем и полоской до следующей ступени */
function AuraRow({ aura, isMe }: { aura: number; isMe: boolean }) {
  const t = tierOf(aura);
  const p = t.next ? t.stepProgress : 1;
  return (
    <Link href="/aura/" className="xc-aura" style={{ "--p": `${Math.round(p * 100)}%` } as React.CSSProperties}>
      <span className="xc-aura-top"><small>AURA</small><b><CountUp value={aura} ms={1300} /></b><em>{t.icon} {t.fullName}</em></span>
      <span className="xc-aura-bar"><i /></span>
      <span className="xc-aura-hint">{t.next && t.stepNext ? (isMe ? `ещё ${t.stepNext - aura} до следующей ступени` : `до следующей ступени ${t.stepNext - aura}`) : "Высший уровень"}</span>
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
