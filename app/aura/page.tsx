"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { RULES, TIERS, tierOf } from "@/lib/aura";
import { useDecos } from "@/lib/shop";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { CountUp } from "../CountUp";
import { RoleBadge } from "../ProfileHeader";
import { TitleChip, WithRing } from "../Deco";
import { Shop } from "./Shop";

export type Row = {
  rank: number; user_id: string; username: string; display_name: string; avatar: string | null; accent: string; niches: string; role: string; is_support: boolean;
  aura: number; works: number; projects: number; milestones: number; goals: number; tasks: number; friends: number; subs: number; days: number; articles: number; profile: number;
};

const VIEWS = [
  { id: "top", label: "Лидерборд" },
  { id: "quests", label: "Задания" },
  { id: "shop", label: "AURA Shop" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export default function AuraPage() {
  const sp = useSearchParams();
  const view: View = VIEWS.find((v) => v.id === sp.get("tab"))?.id ?? "top";
  const { ready, me } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [niche, setNiche] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    document.title = "AURA · лидерборд";
    if (!ready) return;
    setRows(null);
    supabase.rpc("leaderboard", { p_niche: niche || null, p_limit: 200 }).then(({ data }) => setRows((data as Row[]) ?? []));
  }, [ready, niche]);

  const decos = useDecos((rows ?? []).slice(0, 60).map((r) => r.user_id));
  const top = (rows ?? []).slice(0, 3);
  const mine = rows?.find((r) => r.user_id === me?.id);
  const podium = [top[1], top[0], top[2]];

  return (
    <>
      <TopBar />
      <div className="au-bg" aria-hidden="true"><i /><i /><i /></div>
      <main className="page wide au">
        <header className="au-hero">
          <div>
            <span className="label">Лидерборд</span>
            <h1 className="au-title au-min">AURA</h1>
            <p className="lead">В CS это MMR, в Доте PTS, у нас AURA. Её нельзя купить: она растёт, когда ты делаешь. За каждый новый уровень приходят Coins, на них покупается декор профиля.</p>
          </div>
          {mine && <MyCard r={mine} total={rows?.length ?? 0} />}
        </header>

        <nav className="au-views" aria-label="Разделы AURA">
          {VIEWS.map((v) => (
            <Link key={v.id} href={v.id === "top" ? "/aura/" : `/aura/?tab=${v.id}`} replace scroll={false} className="au-view" aria-current={view === v.id ? "page" : undefined}>
              {v.label}{v.id === "shop" && <em>new</em>}
            </Link>
          ))}
        </nav>

        {view === "top" && (
          <>
            <BoardPicker niche={niche} onPick={setNiche} />

            {rows === null ? <div className="skeleton profile-skeleton" /> : rows.length === 0 ? (
              <div className="pf-empty"><p className="lead">В этой нише пока никого. Выбери нишу в настройках профиля, и ты окажешься здесь.</p></div>
            ) : (
              <>
                <section className="podium" key={niche}>
                  {podium.map((r, i) => r && (
                    <Link key={r.user_id} href={profileHref(r.username)} className={`pod pod-${r.rank} ${r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : "bronze"}`} style={{ "--i": i, "--t": tierOf(r.aura).color } as React.CSSProperties}>
                      {r.rank === 1 && <span className="pod-crown" aria-hidden="true">♛</span>}
                      <WithRing id={decos[r.user_id]?.ring}>
                        <span className="pod-ava"><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={r.rank === 1 ? 96 : 76} userId={r.user_id} /></span>
                      </WithRing>
                      <b className="pod-name">{r.display_name}</b>
                      <TitleChip id={decos[r.user_id]?.title} small />
                      <span className="pod-aura mono"><CountUp value={r.aura} /></span>
                      <span className="pod-tier">{tierOf(r.aura).name}</span>
                      <span className="pod-step"><i className="pod-shine" aria-hidden="true" /><b className="mono">{r.rank}</b><small>{r.rank === 1 ? "золото" : r.rank === 2 ? "серебро" : "бронза"}</small></span>
                    </Link>
                  ))}
                </section>

                <ol className="au-list">
                  {rows.map((r, i) => {
                    const t = tierOf(r.aura);
                    const isMe = r.user_id === me?.id;
                    return (
                      <li key={r.user_id} className={`${isMe ? "me" : ""} ${open === r.user_id ? "open" : ""} ${r.rank <= 3 ? `top top-${r.rank}` : ""}`} style={{ "--i": Math.min(i, 20), "--t": t.color } as React.CSSProperties}>
                        <button type="button" className="au-row" onClick={() => setOpen(open === r.user_id ? null : r.user_id)} aria-expanded={open === r.user_id}>
                          <span className="au-rank mono">{r.rank}</span>
                          <WithRing id={decos[r.user_id]?.ring}><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={40} userId={r.user_id} /></WithRing>
                          <span className="au-who"><b>{r.display_name}{isMe && <em> · это ты</em>}<RoleBadge role={r.role} small support={r.is_support} /><TitleChip id={decos[r.user_id]?.title} small /></b><small>@{r.username}</small></span>
                          <span className="au-tier"><i />{t.name}</span>
                          <span className="au-bar"><i style={{ width: `${Math.min(100, (r.aura / Math.max(1, rows[0].aura)) * 100)}%` }} /></span>
                          <b className="au-score mono">{r.aura}</b>
                        </button>
                        {open === r.user_id && (
                          <div className="au-break">
                            {RULES.map((rule) => {
                              const n = r[rule.key as keyof Row] as number;
                              return n ? <span key={rule.key}><b className="mono">{n}</b>{rule.label.toLowerCase()}</span> : null;
                            })}
                            <Link href={profileHref(r.username)} className="link-btn">Профиль →</Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </>
        )}

        {view === "quests" && <Quests mine={mine ?? null} username={me?.username ?? null} canWrite={me?.role === "owner"} loggedIn={!!me} />}
        {view === "shop" && <Shop />}
      </main>
    </>
  );
}

function MyCard({ r, total }: { r: Row; total: number }) {
  const t = tierOf(r.aura);
  return (
    <div className="au-me" style={{ "--t": t.color } as React.CSSProperties}>
      <span className="label">Твоя аура</span>
      <b className="mono"><CountUp value={r.aura} /></b>
      <span className="au-me-tier"><i />{t.name} · место {r.rank} из {total}</span>
      {t.next && <span className="au-me-next"><i style={{ width: `${Math.round(t.progress * 100)}%` }} /></span>}
      {t.next && <small>Ещё {t.next.min - r.aura} до «{t.next.name}»</small>}
    </div>
  );
}

// Задания: каждое правило AURA с прогрессом и кнопкой туда, где это делается
const QUESTS: { key: keyof Row; label: string; pts: number; cap: number | null; hint: string; icon: string; href: (u: string | null) => string | null; cta: string }[] = [
  { key: "profile", label: "Заполни профиль", pts: 15, cap: 6, hint: "Аватар, баннер, био, ниши, «о себе» и «ищу»: +15 за каждое", icon: "◐", href: (u) => (u ? "/settings/" : null), cta: "Настройки" },
  { key: "works", label: "Добавь работу в Proof of Work", pts: 50, cap: 30, hint: "Ролик, сайт, запуск, с результатом в цифрах", icon: "◆", href: (u) => (u ? `/u/?n=${u}&tab=work` : null), cta: "К работам" },
  { key: "projects", label: "Расскажи о проекте", pts: 60, cap: 15, hint: "Что строишь сейчас и кого ищешь", icon: "▲", href: (u) => (u ? `/u/?n=${u}&tab=projects` : null), cta: "К проектам" },
  { key: "milestones", label: "Закрой этап проекта", pts: 20, cap: 100, hint: "Отметь этап готовым на странице проекта", icon: "✓", href: (u) => (u ? `/u/?n=${u}&tab=projects` : null), cta: "К проектам" },
  { key: "goals", label: "Покори цель", pts: 60, cap: 30, hint: "Поставь вершину и дойди до неё", icon: "⚑", href: () => "/workspace/?tab=plans&view=goals", cta: "К целям" },
  { key: "tasks", label: "Выполняй задачи", pts: 5, cap: 300, hint: "Задачи в Plans и шаги целей", icon: "☐", href: () => "/workspace/?tab=plans", cta: "К задачам" },
  { key: "friends", label: "Находи своих людей", pts: 10, cap: 150, hint: "Каждый принятый друг", icon: "◎", href: () => "/people/", cta: "К людям" },
  { key: "subs", label: "Собери подписчиков канала", pts: 3, cap: 1000, hint: "Создай открытый канал и веди его", icon: "◈", href: () => "/messages/", cta: "К каналам" },
  { key: "days", label: "Заходи каждый день", pts: 10, cap: 60, hint: "Активные дни за последние 60 дней", icon: "☀", href: () => "/workspace/", cta: "В Workspace" },
  { key: "articles", label: "Напиши статью в Обучение", pts: 100, cap: null, hint: "Для команды платформы", icon: "✎", href: () => "/learn/", cta: "К Обучению" },
];

function Quests({ mine, username, canWrite, loggedIn }: { mine: Row | null; username: string | null; canWrite: boolean; loggedIn: boolean }) {
  const list = QUESTS.filter((q) => q.key !== "articles" || canWrite);
  return (
    <section className="qx">
      <div className="qx-head">
        <h2 className="qx-h">Задания</h2>
        <p>У каждого задания есть потолок, накрутить нельзя. Каждый новый уровень приносит Coins для <Link href="/aura/?tab=shop" replace scroll={false}>AURA Shop</Link>.</p>
      </div>
      <div className="qx-grid">
        {list.map((q, i) => {
          const n = mine ? (mine[q.key] as number) : 0;
          const done = q.cap !== null && n >= q.cap;
          const pct = q.cap ? Math.min(100, (n / q.cap) * 100) : Math.min(100, n * 10);
          const href = q.href(username);
          return (
            <article key={q.key} className={`qx-card ${done ? "done" : ""}`} style={{ "--i": i } as React.CSSProperties}>
              <div className="qx-top">
                <span className="qx-icon" aria-hidden="true">{done ? "✓" : q.icon}</span>
                <span className="qx-pts mono">+{q.pts}</span>
              </div>
              <b className="qx-title">{q.label}</b>
              <small className="qx-hint">{q.hint}</small>
              <div className="qx-progress">
                <span className="qx-bar"><i style={{ width: `${pct}%` }} /></span>
                <span className="mono">{q.cap ? `${Math.min(n, q.cap)}/${q.cap}` : n}</span>
              </div>
              <div className="qx-foot">
                <span>{done ? "Максимум" : loggedIn ? `+${Math.min(n, q.cap ?? n) * q.pts} получено` : "Войди, чтобы видеть прогресс"}</span>
                {href && !done && <Link href={href} className="qx-go">{q.cta}<em aria-hidden="true">→</em></Link>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="qx-tiers">
        {TIERS.map((t, i) => (
          <div key={t.name} className="qx-tier" style={{ "--t": t.color, "--i": i } as React.CSSProperties}>
            <i /><b>{t.name}</b><span className="mono">{t.min}+</span>
          </div>
        ))}
      </div>
      <p className="hint">С уровня «Сияние» открываются премиум-стикеры в чатах.</p>
    </section>
  );
}

/** LiderBoard: общий или по нише — ниши в выпадающем списке */
function BoardPicker({ niche, onPick }: { niche: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = NICHES.find((n) => n.id === niche);
  return (
    <div className="lb-pick" ref={box}>
      <span className="lb-label">LiderBoard</span>
      <div className="lb-seg">
        <span className="lb-pill" style={{ transform: cur ? "translateX(100%)" : "none" }} aria-hidden="true" />
        <button type="button" className="lb-opt" aria-pressed={!cur} onClick={() => { onPick(""); setOpen(false); }}>Общий</button>
        <button type="button" className="lb-opt" aria-pressed={!!cur} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((v) => !v)}>
          {cur ? <><i style={{ background: cur.color }} />{cur.title}</> : "По нишам"}
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none" }}><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
      {open && (
        <ul className="lb-menu" role="listbox" aria-label="Ниши">
          {NICHES.map((n, i) => (
            <li key={n.id}>
              <button type="button" role="option" aria-selected={niche === n.id} style={{ "--c": n.color, "--i": i } as React.CSSProperties} onClick={() => { onPick(n.id); setOpen(false); }}>
                <i />{n.title}{niche === n.id && <em>✓</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
