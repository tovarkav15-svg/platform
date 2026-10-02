"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { RULES, TIERS, tierOf } from "@/lib/aura";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { CountUp } from "../CountUp";
import { RoleBadge } from "../ProfileHeader";

type Row = {
  rank: number; user_id: string; username: string; display_name: string; avatar: string | null; accent: string; niches: string; role: string; is_support: boolean;
  aura: number; works: number; projects: number; milestones: number; goals: number; tasks: number; friends: number; subs: number; days: number; articles: number;
};

export default function AuraPage() {
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
            <p className="lead">В CS это MMR, в Доте PTS, у нас AURA. Её нельзя купить: она растёт, когда ты делаешь. Работы, проекты, покорённые цели, друзья, подписчики и активные дни.</p>
          </div>
          {mine && <MyCard r={mine} total={rows?.length ?? 0} />}
        </header>

        <div className="filters">
          <button type="button" className={`fchip ${!niche ? "on" : ""}`} onClick={() => setNiche("")}>Вся платформа</button>
          {NICHES.map((n) => (
            <button key={n.id} type="button" className={`fchip ${niche === n.id ? "on" : ""}`} style={{ "--c": n.color } as React.CSSProperties} onClick={() => setNiche(niche === n.id ? "" : n.id)}>{n.title}</button>
          ))}
        </div>

        {rows === null ? <div className="skeleton profile-skeleton" /> : rows.length === 0 ? (
          <div className="pf-empty"><p className="lead">В этой нише пока никого. Выбери нишу в настройках профиля, и ты окажешься здесь.</p></div>
        ) : (
          <>
            <section className="podium" key={niche}>
              {podium.map((r, i) => r && (
                <Link key={r.user_id} href={profileHref(r.username)} className={`pod pod-${r.rank} ${r.rank === 1 ? "gold" : r.rank === 2 ? "silver" : "bronze"}`} style={{ "--i": i, "--t": tierOf(r.aura).color } as React.CSSProperties}>
                  {r.rank === 1 && <span className="pod-crown" aria-hidden="true">♛</span>}
                  <span className="pod-ava"><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={r.rank === 1 ? 96 : 76} userId={r.user_id} /></span>
                  <b className="pod-name">{r.display_name}</b>
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
                      <Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={40} userId={r.user_id} />
                      <span className="au-who"><b>{r.display_name}{isMe && <em> · это ты</em>}<RoleBadge role={r.role} small support={r.is_support} /></b><small>@{r.username}</small></span>
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

        <Quests mine={mine ?? null} username={me?.username ?? null} canWrite={me?.role === "owner"} />
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

// Задания: каждое правило AURA — с прогрессом и кнопкой туда, где это делается
const QUESTS: { key: keyof Row; label: string; pts: number; cap: number | null; hint: string; color: string; icon: string; href: (u: string | null) => string | null; cta: string }[] = [
  { key: "works", label: "Добавь работу в Proof of Work", pts: 30, cap: 20, hint: "Ролик, сайт, запуск — с результатом в цифрах", color: "#FF6A3D", icon: "◆", href: (u) => (u ? `/u/?n=${u}&tab=work` : null), cta: "К моим работам" },
  { key: "projects", label: "Расскажи о проекте", pts: 40, cap: 10, hint: "Что строишь сейчас и кого ищешь", color: "#2F7BFF", icon: "▲", href: (u) => (u ? `/u/?n=${u}&tab=projects` : null), cta: "К проектам" },
  { key: "milestones", label: "Закрой этап проекта", pts: 10, cap: 50, hint: "Отметь этап готовым на странице проекта", color: "#0EA5B7", icon: "✓", href: (u) => (u ? `/u/?n=${u}&tab=projects` : null), cta: "Открыть проекты" },
  { key: "goals", label: "Покори цель", pts: 50, cap: 20, hint: "Поставь вершину и дойди до неё", color: "#7B61FF", icon: "⚑", href: () => "/workspace/?tab=plans&view=goals", cta: "К целям" },
  { key: "tasks", label: "Выполняй задачи", pts: 2, cap: 150, hint: "Задачи в Plans и шаги целей", color: "#1FA67A", icon: "☑", href: () => "/workspace/?tab=plans", cta: "К задачам" },
  { key: "friends", label: "Находи своих людей", pts: 5, cap: 100, hint: "Каждый принятый друг", color: "#FF4F8B", icon: "♥", href: () => "/people/", cta: "Найти людей" },
  { key: "subs", label: "Собери подписчиков канала", pts: 2, cap: 500, hint: "Создай открытый канал и веди его", color: "#E8B100", icon: "◈", href: () => "/messages/", cta: "К каналам" },
  { key: "days", label: "Заходи каждый день", pts: 3, cap: 60, hint: "Активные дни за последние 60 дней", color: "#C2410C", icon: "☀", href: () => "/workspace/", cta: "В Workspace" },
  { key: "articles", label: "Напиши статью в Обучение", pts: 80, cap: null, hint: "Для команды платформы", color: "#141414", icon: "✎", href: () => "/learn/", cta: "К Обучению" },
];

function Quests({ mine, username, canWrite }: { mine: Row | null; username: string | null; canWrite: boolean }) {
  const list = QUESTS.filter((q) => q.key !== "articles" || canWrite);
  return (
    <section className="au-quests">
      <div className="au-quests-head">
        <div>
          <span className="label">Задания</span>
          <h2 className="h-md caps">Как <span className="it">получить</span> AURA</h2>
        </div>
        <p className="lead small">У каждого задания есть потолок, поэтому накрутить нельзя. Нажми «Перейти» и сделай.</p>
      </div>
      <div className="au-quest-grid">
        {list.map((q, i) => {
          const n = mine ? (mine[q.key] as number) : 0;
          const done = q.cap !== null && n >= q.cap;
          const pct = q.cap ? Math.min(100, (n / q.cap) * 100) : Math.min(100, n * 10);
          const href = q.href(username);
          return (
            <article key={q.key} className={`quest ${done ? "done" : ""}`} style={{ "--q": q.color, "--i": i } as React.CSSProperties}>
              <header>
                <span className="quest-icon">{q.icon}</span>
                <span className="quest-pts mono">+{q.pts}</span>
              </header>
              <b className="quest-title">{q.label}</b>
              <small>{q.hint}</small>
              <div className="quest-progress">
                <span className="quest-bar"><i style={{ width: `${pct}%` }} /></span>
                <span className="mono">{q.cap ? `${Math.min(n, q.cap)} / ${q.cap}` : n}</span>
              </div>
              <span className="quest-earned">{done ? "Максимум набран ✓" : mine ? `Уже +${Math.min(n, q.cap ?? n) * q.pts} AURA` : "Войди, чтобы видеть прогресс"}</span>
              {href && !done && <Link href={href} className="quest-go">{q.cta} <em>→</em></Link>}
            </article>
          );
        })}
      </div>
      <div className="au-tiers">
        <span className="label">Уровни</span>
        <div>
          {TIERS.map((t, i) => (
            <span key={t.name} style={{ "--t": t.color, "--i": i } as React.CSSProperties}><i />{t.name}<em className="mono">{t.min}+</em></span>
          ))}
        </div>
        <p className="hint">С уровня «Сияние» открываются премиум-стикеры в чатах.</p>
      </div>
    </section>
  );
}
