"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OUTCOME, rub, type Client } from "@/lib/workspace";
import { PRIORITY, addDays, dueLabel, iso, nextDue, today, type PlanTask } from "@/lib/plans";
import { CountUp } from "../CountUp";

type Tx = { type: "income" | "expense"; amount: number; date: string };
type Pay = { id: string; direction: "in" | "out"; title: string; amount: number; due_date: string; status: string };

/** Обзор дня: всё важное из Clients, Plans и Finance на одном экране */
export function Overview({ userId, name }: { userId: string; name: string }) {
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [clients, setClients] = useState<Pick<Client, "id" | "outcome" | "qualify">[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const td = today();
  const month = td.slice(0, 7);

  const load = useCallback(async () => {
    const [t, c, f, p] = await Promise.all([
      supabase.from("plan_tasks").select("*").eq("user_id", userId).eq("done", false).not("due_date", "is", null).lte("due_date", iso(addDays(new Date(), 1))).order("due_date"),
      supabase.from("clients").select("id, outcome, qualify").eq("user_id", userId),
      supabase.from("fin_transactions").select("type, amount, date").eq("user_id", userId).gte("date", `${month}-01`),
      supabase.from("fin_payments").select("id, direction, title, amount, due_date, status").eq("user_id", userId).eq("status", "planned").lte("due_date", iso(addDays(new Date(), 14))).order("due_date"),
    ]);
    setTasks(((t.data as PlanTask[]) ?? []).sort((a, b) => a.due_date!.localeCompare(b.due_date!) || b.priority - a.priority));
    setClients(c.data ?? []);
    setTxs(((f.data as Tx[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setPays(((p.data as Pay[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
  }, [userId, month]);

  useEffect(() => { load(); }, [load]);

  const [gone, setGone] = useState<Set<string>>(new Set());
  async function complete(t: PlanTask) {
    setGone((s) => new Set(s).add(t.id));
    if (t.repeat && t.due_date) await supabase.from("plan_tasks").update({ due_date: nextDue(t.due_date, t.repeat) }).eq("id", t.id);
    else await supabase.from("plan_tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", t.id);
    setTimeout(load, 450);
  }

  if (!tasks) return <div className="skeleton profile-skeleton" />;

  const hour = new Date().getHours();
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const todayTasks = tasks.filter((t) => t.due_date! <= td);
  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const funnel = [{ v: "", c: "#C9C9C6", label: "Без статуса" }, ...OUTCOME.map((o) => ({ ...o, label: o.v }))].map((o) => ({ ...o, n: clients.filter((c) => (c.outcome || "") === o.v).length }));
  const maxN = Math.max(1, ...funnel.map((f) => f.n));
  const hot = clients.filter((c) => c.qualify === "Горячий" && c.outcome !== "Сделка" && c.outcome !== "Отказ").length;

  return (
    <div className="ov">
      <section className="ov-hello">
        <span className="label">{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span>
        <h2 className="caps">{hello}, <span className="it">{name}</span></h2>
        <p className="lead">
          {todayTasks.length ? `${todayTasks.length} ${todayTasks.length === 1 ? "задача" : todayTasks.length < 5 ? "задачи" : "задач"} на сегодня` : "На сегодня задач нет"}
          {pays.length ? ` · ${pays.length} ${pays.length === 1 ? "оплата" : "оплат"} в ближайшие две недели` : ""}
          {hot ? ` · ${hot} горячих клиентов ждут` : ""}
        </p>
      </section>

      <div className="ov-grid">
        <section className="ov-card ov-tasks">
          <header><span className="ov-dot" /><b>Задачи</b><Link href="/workspace/?tab=plans" className="link-btn">Все планы →</Link></header>
          {tasks.length ? (
            <ul>
              {tasks.slice(0, 7).map((t, i) => (
                <li key={t.id} className={gone.has(t.id) ? "gone" : ""} style={{ "--i": i, "--p": PRIORITY[t.priority].c } as React.CSSProperties}>
                  <button type="button" className={`pchk p${t.priority}`} aria-pressed={gone.has(t.id)} onClick={() => complete(t)} aria-label="Выполнить" />
                  <span className="ov-task-title">{t.title}</span>
                  <span className={`meta-date ${t.due_date! < td ? "overdue" : ""}`}>{dueLabel(t.due_date, t.due_time)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="ov-empty">Чисто. Можно взять что-то из «Входящих».</p>}
        </section>

        <section className="ov-card ov-money">
          <header><span className="ov-dot" /><b>Деньги за месяц</b><Link href="/workspace/?tab=finance" className="link-btn">Финансы →</Link></header>
          <div className="ov-profit">
            <span className="label">Прибыль</span>
            <b className="mono"><CountUp value={income - expense} format={(n) => rub(n, true)} /></b>
          </div>
          <div className="ov-split">
            <span><i style={{ background: "#2F7BFF" }} />Доход <b className="mono"><CountUp value={income} format={(n) => rub(n)} /></b></span>
            <span><i style={{ background: "#FF6A3D" }} />Расход <b className="mono"><CountUp value={expense} format={(n) => rub(n)} /></b></span>
          </div>
          <div className={`ov-ratio ${income + expense === 0 ? "is-empty" : ""}`} aria-hidden="true">
            {income > 0 && <i style={{ flexGrow: income, background: "#2F7BFF" }} />}
            {expense > 0 && <i style={{ flexGrow: expense, background: "#FF6A3D" }} />}
          </div>
        </section>

        <section className="ov-card ov-funnel">
          <header><span className="ov-dot" /><b>Воронка клиентов</b><Link href="/workspace/?tab=clients&view=pipeline" className="link-btn">Открыть →</Link></header>
          {clients.length ? (
            <ul>
              {funnel.map((f, i) => (
                <li key={f.label} style={{ "--i": i } as React.CSSProperties}>
                  <span className="fn-label">{f.label}</span>
                  <span className="fn-track"><i style={{ width: `${(f.n / maxN) * 100}%`, background: f.c }} /></span>
                  <b className="mono">{f.n}</b>
                </li>
              ))}
            </ul>
          ) : <p className="ov-empty">Клиентов пока нет. <Link href="/workspace/?tab=clients">Добавить первого</Link></p>}
        </section>

        <section className="ov-card ov-pays">
          <header><span className="ov-dot" /><b>Ближайшие оплаты</b><Link href="/workspace/?tab=finance" className="link-btn">График →</Link></header>
          {pays.length ? (
            <ul>
              {pays.slice(0, 5).map((p, i) => (
                <li key={p.id} style={{ "--i": i } as React.CSSProperties} className={p.due_date < td ? "late" : ""}>
                  <span className="ov-pay-date mono">{new Date(p.due_date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}</span>
                  <span className="ov-task-title">{p.title}</span>
                  <b className="mono" style={{ color: p.direction === "in" ? "#1a4fb8" : "var(--graphite)" }}>{p.direction === "in" ? "+" : "−"}{rub(p.amount)}</b>
                </li>
              ))}
            </ul>
          ) : <p className="ov-empty">Ближайших оплат нет.</p>}
        </section>
      </div>
    </div>
  );
}
