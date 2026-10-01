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
            <h1 className="au-title" aria-label="AURA">{"AURA".split("").map((c, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{c}</span>)}</h1>
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
                <Link key={r.user_id} href={profileHref(r.username)} className={`pod pod-${r.rank}`} style={{ "--i": i, "--t": tierOf(r.aura).color } as React.CSSProperties}>
                  {r.rank === 1 && <span className="pod-crown" aria-hidden="true">♛</span>}
                  <span className="pod-ava"><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={r.rank === 1 ? 96 : 76} userId={r.user_id} /></span>
                  <b className="pod-name">{r.display_name}</b>
                  <span className="pod-aura mono"><CountUp value={r.aura} /></span>
                  <span className="pod-tier">{tierOf(r.aura).name}</span>
                  <span className="pod-step mono">{r.rank}</span>
                </Link>
              ))}
            </section>

            <ol className="au-list">
              {rows.map((r, i) => {
                const t = tierOf(r.aura);
                const isMe = r.user_id === me?.id;
                return (
                  <li key={r.user_id} className={`${isMe ? "me" : ""} ${open === r.user_id ? "open" : ""}`} style={{ "--i": Math.min(i, 20), "--t": t.color } as React.CSSProperties}>
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

        <section className="au-rules">
          <div>
            <span className="label">Как получить AURA</span>
            <h2 className="h-md caps">Делай, <span className="it">и аура</span> растёт</h2>
            <p className="lead small">У каждого источника есть потолок, поэтому накрутить нельзя: побеждает тот, кто делает много разного.</p>
          </div>
          <ul className="au-rule-list">
            {RULES.map((r, i) => (
              <li key={r.key} style={{ "--i": i } as React.CSSProperties}><b className="mono">+{r.pts}</b><span>{r.label}<small>{r.cap}</small></span></li>
            ))}
          </ul>
          <div className="au-tiers">
            <span className="label">Уровни</span>
            <div>
              {TIERS.map((t) => (
                <span key={t.name} style={{ "--t": t.color } as React.CSSProperties}><i />{t.name}<em className="mono">{t.min}+</em></span>
              ))}
            </div>
            <p className="hint">С уровня «Сияние» открываются премиум-стикеры в чатах.</p>
          </div>
        </section>
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
