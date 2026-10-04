"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { NICHES } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { useLive } from "@/lib/live";

type Day = { day: string; signups: number; active: number; messages: number; orders: number; responses: number; jobs: number };
export type Stats = {
  days: number;
  totals: Record<string, number>;
  retention: { cohort: number; returned: number };
  funnel: { registered: number; profile: number; showed: number; active7: number };
  sources: { referral: number; organic: number };
  referrers: { username: string; name: string; n: number; confirmed: number }[];
  niches: Record<string, number>;
  series: Day[];
};

const SERIES: { key: keyof Omit<Day, "day">; label: string; color: string }[] = [
  { key: "signups", label: "Регистрации", color: "#7B61FF" },
  { key: "active", label: "Активные люди", color: "#1FA67A" },
  { key: "messages", label: "Сообщения", color: "#2F7BFF" },
  { key: "orders", label: "Новые заказы", color: "#E8930C" },
  { key: "responses", label: "Отклики", color: "#D9468F" },
  { key: "jobs", label: "Новые бейджи", color: "#0E9AA7" },
];
const fmtDay = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Аналитика платформы для модераторов: всё считает база одной функцией admin_stats */
export function Analytics() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_stats", { p_days: days });
    if (error) setErr(error.message); else { setErr(""); setS(data as Stats); }
  }, [days]);
  useEffect(() => { setS(null); load(); }, [load]);
  useLive(["profiles", "orders", "order_responses", "jobs"], load, { poll: 60000 });

  if (err) return <p className="md-empty">{err}</p>;
  if (!s) return <div className="skeleton list-skeleton" />;
  return <AnalyticsView s={s} days={days} setDays={setDays} />;
}

export function AnalyticsView({ s, days, setDays }: { s: Stats; days: number; setDays: (d: number) => void }) {
  const t = s.totals;
  const sum = (k: keyof Omit<Day, "day">) => s.series.reduce((a, d) => a + d[k], 0);

  return (
    <section className="an">
      <div className="an-head">
        <div className="seg small" role="tablist" aria-label="Период">
          {[7, 30, 90].map((d) => <button key={d} type="button" className="seg-item" aria-current={days === d ? "page" : undefined} onClick={() => setDays(d)}>{d} дней</button>)}
        </div>
        <span className="an-live"><i />обновляется само</span>
      </div>

      <div className="an-kpis">
        <Kpi label="Всего людей" value={t.users} sub={`+${t.new} за ${s.days} дн`} />
        <Kpi label="Сейчас онлайн" value={t.online_now} sub="за последние 3 минуты" accent />
        <Kpi label="Активны сегодня" value={t.active_today} sub={`${pct(t.active_today, t.users)}% от всех`} />
        <Kpi label="Активны за 7 дней" value={t.active7} sub={`${pct(t.active7, t.users)}% от всех`} />
        <Kpi label="Активны за 30 дней" value={t.active30} sub={`${pct(t.active30, t.users)}% от всех`} />
        <Kpi label="Вернулись через неделю" value={s.retention.cohort ? `${pct(s.retention.returned, s.retention.cohort)}%` : "—"}
          sub={s.retention.cohort ? `${s.retention.returned} из ${s.retention.cohort} зарегистрированных 7–30 дней назад` : "появится, когда платформе будет больше недели"} />
      </div>

      <div className="an-grid">
        {SERIES.map((x) => <Bars key={x.key} title={x.label} color={x.color} total={sum(x.key)} data={s.series.map((d) => ({ day: d.day, v: d[x.key] }))} />)}
      </div>

      <div className="an-row">
        <section className="an-card">
          <header><b>Воронка</b><small>от регистрации до активности</small></header>
          <Funnel steps={[
            { label: "Зарегистрировались", v: s.funnel.registered },
            { label: "Заполнили профиль (3+ поля)", v: s.funnel.profile },
            { label: "Показали работу, проект или бейдж", v: s.funnel.showed },
            { label: "Заходили за последние 7 дней", v: s.funnel.active7 },
          ]} />
        </section>

        <section className="an-card">
          <header><b>Откуда пришли</b><small>новые за {s.days} дней</small></header>
          <Split a={{ label: "Сами", v: s.sources.organic, c: "#2F7BFF" }} b={{ label: "По приглашению", v: s.sources.referral, c: "#E8930C" }} />
          <div className="an-sub">Кто приводит людей</div>
          {s.referrers.length ? (
            <ol className="an-refs">
              {s.referrers.map((r) => (
                <li key={r.username}><Link href={profileHref(r.username)}>{r.name} <small>@{r.username}</small></Link><span className="mono">{r.n}</span><em>{r.confirmed} засчитано</em></li>
              ))}
            </ol>
          ) : <p className="md-empty">Пока никто никого не пригласил.</p>}
        </section>
      </div>

      <div className="an-row">
        <section className="an-card">
          <header><b>Ниши</b><small>сколько людей выбрали нишу (можно несколько)</small></header>
          <Niches data={s.niches} />
        </section>
        <section className="an-card">
          <header><b>Контент и экономика</b><small>сейчас на платформе</small></header>
          <dl className="an-facts">
            <div><dt>Бейджей на Бирже</dt><dd className="mono">{t.jobs}</dd></div>
            <div><dt>Открытых заказов</dt><dd className="mono">{t.orders_open}</dd></div>
            <div><dt>Заказов в работе</dt><dd className="mono">{t.orders_in_work}</dd></div>
            <div><dt>Откликов за период</dt><dd className="mono">{t.responses}</dd></div>
            <div><dt>Сообщений за период</dt><dd className="mono">{t.messages}</dd></div>
            <div><dt>Работ в Proof of Work</dt><dd className="mono">{t.works}</dd></div>
            <div><dt>Проектов</dt><dd className="mono">{t.projects}</dd></div>
            <div><dt>Статей в Обучении</dt><dd className="mono">{t.articles}</dd></div>
            <div><dt>Coins потрачено в Shop</dt><dd className="mono">{t.coins_spent.toLocaleString("ru-RU")}</dd></div>
            <div><dt>Открытых жалоб</dt><dd className="mono">{t.reports_open}</dd></div>
            <div><dt>Забанено сейчас</dt><dd className="mono">{t.banned}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent?: boolean }) {
  return (
    <div className={`an-kpi ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <b className="mono">{typeof value === "number" ? value.toLocaleString("ru-RU") : value}</b>
      <small>{sub}</small>
    </div>
  );
}

/** Столбики по дням: один цвет на график, подсказка при наведении, тонкая базовая линия */
function Bars({ title, color, total, data }: { title: string; color: string; total: number; data: { day: string; v: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.v));
  const h = hover !== null ? data[hover] : null;
  return (
    <section className="an-card an-bars" style={{ "--c": color } as React.CSSProperties}>
      <header><b>{title}</b><span className="mono">{total.toLocaleString("ru-RU")}</span></header>
      <div className="an-tip">{h ? <><b className="mono">{h.v}</b> · {fmtDay(h.day)}</> : <>макс. {max} в день</>}</div>
      <div className="an-plot" onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}: всего ${total} за ${data.length} дней`}>
        {data.map((d, i) => (
          <span key={d.day} className={`an-col ${hover === i ? "on" : ""}`} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
            <i style={{ height: `${d.v ? Math.max(3, (d.v / max) * 100) : 0}%` }} />
          </span>
        ))}
      </div>
      <div className="an-axis"><span>{fmtDay(data[0].day)}</span><span>{fmtDay(data[data.length - 1].day)}</span></div>
    </section>
  );
}

function Funnel({ steps }: { steps: { label: string; v: number }[] }) {
  const top = Math.max(1, steps[0].v);
  return (
    <ol className="an-funnel">
      {steps.map((st, i) => (
        <li key={st.label}>
          <div className="an-f-bar"><i style={{ width: `${Math.max(2, (st.v / top) * 100)}%` }} /></div>
          <span className="an-f-label">{st.label}</span>
          <b className="mono">{st.v}</b>
          <em className="mono">{i === 0 ? "100%" : `${pct(st.v, top)}%`}</em>
        </li>
      ))}
    </ol>
  );
}

function Split({ a, b }: { a: { label: string; v: number; c: string }; b: { label: string; v: number; c: string } }) {
  const total = a.v + b.v;
  return (
    <div className="an-split">
      <div className="an-split-bar">
        {total === 0 ? <i style={{ width: "100%", background: "rgba(20,20,20,.08)" }} /> : <>
          <i style={{ width: `${(a.v / total) * 100}%`, background: a.c }} />
          <i style={{ width: `${(b.v / total) * 100}%`, background: b.c }} />
        </>}
      </div>
      <div className="an-split-legend">
        <span><i style={{ background: a.c }} />{a.label} <b className="mono">{a.v}</b> <em>{pct(a.v, total)}%</em></span>
        <span><i style={{ background: b.c }} />{b.label} <b className="mono">{b.v}</b> <em>{pct(b.v, total)}%</em></span>
      </div>
    </div>
  );
}

function Niches({ data }: { data: Record<string, number> }) {
  const rows = NICHES.map((n) => ({ id: n.id, title: n.title, v: data[n.id] ?? 0 })).sort((x, y) => y.v - x.v);
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="an-niches">
      {rows.map((r) => (
        <li key={r.id}>
          <span>{r.title}</span>
          <div className="an-n-bar"><i style={{ width: `${(r.v / max) * 100}%` }} /></div>
          <b className="mono">{r.v}</b>
        </li>
      ))}
    </ul>
  );
}
