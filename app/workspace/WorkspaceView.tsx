"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase, type Profile } from "@/lib/supabase";
import { rub } from "@/lib/workspace";
import { today } from "@/lib/plans";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { CountUp } from "../CountUp";
import { Overview } from "./Overview";
import { Clients } from "./Clients";
import { Plans } from "./Plans";
import { Finance } from "./Finance";

type Tab = "overview" | "clients" | "plans" | "finance";
const TABS: { id: Tab; label: string; sub: string; icon: string }[] = [
  { id: "overview", label: "Обзор", sub: "Главное на сегодня", icon: "◎" },
  { id: "clients", label: "Clients", sub: "Клиенты и сделки", icon: "◧" },
  { id: "plans", label: "Plans", sub: "Задачи и планы", icon: "◷" },
  { id: "finance", label: "Finance", sub: "Деньги и оплаты", icon: "◈" },
];

type Counters = { inWork: number; today: number; profit: number };

export function WorkspaceView({ me }: { me: Profile | null }) {
  const sp = useSearchParams();
  const router = useRouter();
  const tab: Tab = TABS.find((t) => t.id === sp.get("tab"))?.id ?? "overview";
  const [counters, setCounters] = useState<Counters | null>(null);
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => { document.title = `Workspace · ${TABS.find((t) => t.id === tab)!.label}`; }, [tab]);

  // Живые счётчики в боковой панели
  useEffect(() => {
    if (!me) return;
    const month = today().slice(0, 7);
    Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("outcome", "В работе"),
      supabase.from("plan_tasks").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("done", false).lte("due_date", today()),
      supabase.from("fin_transactions").select("type, amount").eq("user_id", me.id).gte("date", `${month}-01`),
    ]).then(([c, t, f]) => setCounters({
      inWork: c.count ?? 0,
      today: t.count ?? 0,
      profit: (f.data ?? []).reduce((s, x) => s + (x.type === "income" ? 1 : -1) * Number(x.amount), 0),
    }));
  }, [me, tab]);

  // Подсветка активного пункта плавно переезжает
  useLayoutEffect(() => {
    const place = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (!el) return;
      setPill({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight });
      // На телефоне лента разделов горизонтальная: докручиваем её к активному
      const n = nav.current;
      if (n && n.scrollWidth > n.clientWidth) n.scrollTo({ left: el.offsetLeft - 12, behavior: "smooth" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tab, counters]);

  const count = (id: Tab) => {
    if (!counters) return null;
    if (id === "clients") return counters.inWork ? `${counters.inWork} в работе` : null;
    if (id === "plans") return counters.today ? `${counters.today} на сегодня` : null;
    if (id === "finance") return counters.profit ? rub(counters.profit, true) : null;
    return null;
  };

  return (
    <>
      <TopBar />
      <main className="ws2">
        <div className="ws2-aurora" aria-hidden="true"><i /><i /><i /></div>

        <aside className="ws2-rail">
          <div className="ws2-me">
            {me && <Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={44} />}
            <span>
              <b>Workspace</b>
              <small>закрыто · видишь только ты</small>
            </span>
          </div>

          <nav className="ws2-nav" ref={nav} aria-label="Разделы Workspace">
            {pill && <span className="ws2-pill" style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} />}
            {TABS.map((t) => (
              <Link key={t.id} data-tab={t.id} href={`/workspace/?tab=${t.id}`} replace scroll={false}
                className={`ws2-link ws2-${t.id}`} aria-current={tab === t.id ? "page" : undefined}>
                <i className="ws2-ico">{t.icon}</i>
                <span><b>{t.label}</b><small>{count(t.id) ?? t.sub}</small></span>
              </Link>
            ))}
          </nav>

          <div className="ws2-quick">
            <span className="label">Быстро</span>
            <button type="button" onClick={() => router.replace("/workspace/?tab=clients&new=1")}>+ Клиент</button>
            <button type="button" onClick={() => router.replace("/workspace/?tab=plans")}>+ Задача</button>
            <button type="button" onClick={() => router.replace("/workspace/?tab=finance&ops=1")}>+ Операция</button>
          </div>

          {counters && (
            <div className="ws2-mini">
              <span className="label">Сводка</span>
              <div><b className="mono"><CountUp value={counters.today} /></b><small>задач на сегодня</small></div>
              <div><b className="mono"><CountUp value={counters.inWork} /></b><small>сделок в работе</small></div>
              <div><b className="mono"><CountUp value={counters.profit} format={(n) => rub(n, true)} /></b><small>прибыль за месяц</small></div>
            </div>
          )}
        </aside>

        <section className={`ws2-main ws-${tab}`}>
          {!me ? <div className="skeleton profile-skeleton" /> : (
            <div key={tab} className="ws2-body">
              {tab === "overview" && <Overview userId={me.id} name={me.display_name} />}
              {tab === "clients" && <Clients userId={me.id} />}
              {tab === "plans" && <Plans userId={me.id} />}
              {tab === "finance" && <Finance userId={me.id} />}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
