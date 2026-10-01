"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { NICHE_INFO, nicheHref } from "@/lib/learn";
import { TopBar } from "../TopBar";
import { CountUp } from "../CountUp";

export default function LearnPage() {
  const { ready } = useSession();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    document.title = "Обучение";
    if (!ready) return;
    supabase.rpc("article_counts").then(({ data }) => setCounts(Object.fromEntries(((data as { niche: string; n: number }[]) ?? []).map((r) => [r.niche, r.n]))));
  }, [ready]);

  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : 0;

  return (
    <>
      <TopBar />
      <div className="lr-bg" aria-hidden="true"><i /><i /><i /></div>
      <main className="page wide lr">
        <header className="lr-hero">
          <div>
            <span className="label">Обучение</span>
            <h1 className="h-xl caps">Девять <span className="it">ниш</span>, одна платформа</h1>
            <p className="lead">Статьи и разборы от практиков. Выбери нишу: внутри материалы от первых шагов до профи. Новые статьи появляются каждую неделю.</p>
          </div>
          <div className="lr-hero-stat">
            <b className="mono"><CountUp value={total} /></b>
            <span>{total === 0 ? "первые статьи на этой неделе" : total % 10 === 1 && total % 100 !== 11 ? "статья уже вышла" : [2, 3, 4].includes(total % 10) && ![12, 13, 14].includes(total % 100) ? "статьи уже вышли" : "статей уже вышло"}</span>
          </div>
        </header>

        <div className="lr-grid">
          {NICHES.map((n, i) => {
            const info = NICHE_INFO[n.id];
            const c = counts?.[n.id] ?? 0;
            return (
              <Link key={n.id} href={nicheHref(n.id)} className="lr-card" style={{ "--c": n.color, "--i": i } as React.CSSProperties}>
                <span className="lr-num mono">{String(i + 1).padStart(2, "0")}</span>
                <span className="lr-orb" aria-hidden="true" />
                <b className="lr-title caps">{n.title}</b>
                <span className="lr-tag">{info.tagline}</span>
                <span className="lr-topics">{info.topics.map((t) => <i key={t}>{t}</i>)}</span>
                <span className="lr-foot">
                  <span>{counts === null ? "…" : c ? `${c} ${c === 1 ? "статья" : c < 5 ? "статьи" : "статей"}` : "Скоро первые статьи"}</span>
                  <em>Открыть →</em>
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
