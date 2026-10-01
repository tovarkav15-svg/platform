"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadSettings, rub, saveSettings, toCsv, download, type Client } from "@/lib/workspace";
import { addDays, iso, today } from "@/lib/plans";
import { EXPENSE, HBars, INCOME, MonthBars } from "./charts";
import { CountUp } from "../CountUp";

const Money = ({ v, sign }: { v: number; sign?: boolean }) => <CountUp value={v} format={(n) => rub(n, sign)} />;

type Tx = { id: string; type: "income" | "expense"; amount: number; category: string; date: string; note: string; client_id: string | null };
type Payment = {
  id: string; direction: "in" | "out"; title: string; amount: number; category: string; due_date: string;
  repeat: "" | "monthly" | "weekly" | "yearly"; status: "planned" | "paid"; client_id: string | null; note: string;
};
type Tab = "overview" | "ops" | "schedule";

const CATS = {
  income: ["Клиенты", "Продажи", "Зарплата", "Партнёрка", "Инвестиции", "Другое"],
  expense: ["Реклама", "Софт и подписки", "Подрядчики", "Оборудование", "Обучение", "Налоги", "Жильё", "Еда", "Транспорт", "Другое"],
};

const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", long ? { month: "long", year: "numeric" } : { month: "short" }).replace(".", "");
};
const shiftMonth = (key: string, n: number) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
const dayLabel = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
const num = (s: string) => Math.round(parseFloat(s.replace(/\s/g, "").replace(",", ".")) * 100) / 100 || 0;

function nextDate(d: string, r: Payment["repeat"]) {
  const x = new Date(d + "T00:00:00");
  if (r === "weekly") return iso(addDays(x, 7));
  if (r === "monthly") x.setMonth(x.getMonth() + 1);
  if (r === "yearly") x.setFullYear(x.getFullYear() + 1);
  return iso(x);
}

export function Finance({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>(useSearchParams().get("ops") === "1" ? "ops" : "overview");
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [pays, setPays] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Pick<Client, "id" | "username">[]>([]);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [sync, setSync] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [t, p, c, s] = await Promise.all([
      supabase.from("fin_transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("fin_payments").select("*").eq("user_id", userId).order("due_date"),
      supabase.from("clients").select("id, username").eq("user_id", userId).neq("username", "").order("username"),
      loadSettings(userId),
    ]);
    setTxs(((t.data as Tx[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setPays(((p.data as Payment[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setClients(c.data ?? []);
    setSync(s.sync_earnings);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2500); };

  // Доход за текущий месяц уходит в плашку «Сколько ты заработал», если включено
  const syncEarnings = useCallback(async (list: Tx[]) => {
    const cur = today().slice(0, 7);
    const amount = Math.round(list.filter((t) => t.type === "income" && monthKey(t.date) === cur).reduce((s, t) => s + t.amount, 0));
    await supabase.from("earnings").update({ amount }).eq("user_id", userId);
  }, [userId]);

  useEffect(() => { if (sync && txs) syncEarnings(txs); }, [sync, txs, syncEarnings]);

  async function addTx(row: Omit<Tx, "id">) {
    const { data, error } = await supabase.from("fin_transactions").insert(row).select("*").single();
    if (error || !data) return flash("Не получилось сохранить");
    setTxs((p) => [{ ...(data as Tx), amount: Number(data.amount) }, ...(p ?? [])].sort((a, b) => b.date.localeCompare(a.date)));
    flash(row.type === "income" ? `Доход ${rub(row.amount)} записан` : `Расход ${rub(row.amount)} записан`);
  }

  async function delTx(id: string) {
    setTxs((p) => (p ?? []).filter((t) => t.id !== id));
    await supabase.from("fin_transactions").delete().eq("id", id);
  }

  async function markPaid(p: Payment) {
    await addTx({ type: p.direction === "in" ? "income" : "expense", amount: p.amount, category: p.category || (p.direction === "in" ? "Клиенты" : "Другое"), date: today(), note: p.title, client_id: p.client_id });
    await supabase.from("fin_payments").update({ status: "paid" }).eq("id", p.id);
    // Регулярный платёж сразу ставится на следующий период
    if (p.repeat) {
      const { id: _id, status: _s, ...rest } = p;
      await supabase.from("fin_payments").insert({ ...rest, due_date: nextDate(p.due_date, p.repeat), status: "planned" });
    }
    load();
  }

  const stats = useMemo(() => {
    const list = txs ?? [];
    const inMonth = list.filter((t) => monthKey(t.date) === month);
    const income = inMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = inMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const prev = list.filter((t) => monthKey(t.date) === shiftMonth(month, -1));
    const prevProfit = prev.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
    const expected = pays.filter((p) => p.status === "planned" && monthKey(p.due_date) === month);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((key) => {
      const m = list.filter((t) => monthKey(t.date) === key);
      return {
        key, label: monthLabel(key),
        income: m.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expense: m.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    });
    const group = (type: Tx["type"], keyOf: (t: Tx) => string) => {
      const map = new Map<string, number>();
      inMonth.filter((t) => t.type === type).forEach((t) => map.set(keyOf(t), (map.get(keyOf(t)) ?? 0) + t.amount));
      return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    };
    const clientName = (id: string | null) => { const c = clients.find((x) => x.id === id); return c ? `@${c.username}` : "Без клиента"; };
    return {
      income, expense, profit: income - expense, prevProfit,
      expectedIn: expected.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0),
      expectedOut: expected.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0),
      months,
      byCategory: group("expense", (t) => t.category || "Другое"),
      byClient: group("income", (t) => clientName(t.client_id)),
    };
  }, [txs, pays, month, clients]);

  if (!txs) return <div className="skeleton profile-skeleton" />;

  const overdue = pays.filter((p) => p.status === "planned" && p.due_date < today());
  const balance = txs.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const profits = stats.months.map((m) => m.income - m.expense);

  return (
    <div className="ws-section">
      <section className="ledger">
        <div className="ledger-main">
          <span className="label">Баланс за всё время</span>
          <b className={`mono ledger-sum ${balance < 0 ? "neg" : ""}`}><Money v={balance} sign /></b>
          <span className="ledger-sub mono">{txs.length} операций · {pays.filter((p) => p.status === "planned").length} ожидают оплаты</span>
        </div>
        <Spark values={profits} labels={stats.months.map((m) => m.label)} />
      </section>
      <div className="fin-top">
        <div className="seg small" role="tablist" aria-label="Финансы">
          {([["overview", "Обзор"], ["ops", "Доходы и расходы"], ["schedule", "График оплат"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" className="seg-item" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
              {l}{k === "schedule" && overdue.length > 0 && <span className="count-badge">{overdue.length}</span>}
            </button>
          ))}
        </div>
        <div className="month-pick">
          <button type="button" className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">‹</button>
          <b key={month} className="caps">{monthLabel(month, true)}</b>
          <button type="button" className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">›</button>
        </div>
      </div>

      {tab === "overview" && (
        <div key={`o-${month}`} className="fin-pane">
          <div className="fin-tiles">
            <div className="fin-tile"><span className="label"><i style={{ background: INCOME }} />Доход</span><b><Money v={stats.income} /></b></div>
            <div className="fin-tile"><span className="label"><i style={{ background: EXPENSE }} />Расход</span><b><Money v={stats.expense} /></b></div>
            <div className={`fin-tile hero ${stats.profit < 0 ? "neg" : ""}`}>
              <span className="label">Прибыль</span>
              <b><Money v={stats.profit} sign /></b>
              <small>{stats.prevProfit !== 0 || stats.profit !== 0 ? `${stats.profit - stats.prevProfit >= 0 ? "▲" : "▼"} ${rub(Math.abs(stats.profit - stats.prevProfit))} к прошлому месяцу` : "Нет операций"}</small>
            </div>
            <div className="fin-tile"><span className="label">Ожидается</span><b><Money v={stats.expectedIn} /></b><small>к оплате {rub(stats.expectedOut)}</small></div>
          </div>

          <section className="card">
            <div className="section-head"><div className="label">Последние 6 месяцев</div><span className="hint">Нажми на месяц, чтобы открыть его</span></div>
            <MonthBars data={stats.months} active={month} onPick={setMonth} />
          </section>

          <div className="grid2">
            <section className="card"><div className="label">Расходы по категориям</div><HBars rows={stats.byCategory} color={EXPENSE} empty="В этом месяце расходов нет." /></section>
            <section className="card"><div className="label">Доход по клиентам</div><HBars rows={stats.byClient} color={INCOME} empty="В этом месяце доходов нет." /></section>
          </div>

          <section className="card">
            <div className="section-head"><div className="label">Ближайшие оплаты</div><button type="button" className="link-btn" onClick={() => setTab("schedule")}>Весь график</button></div>
            <PaymentList items={pays.filter((p) => p.status === "planned" && p.due_date <= iso(addDays(new Date(), 14)))} clients={clients} onPaid={markPaid} onDelete={null} empty="На ближайшие две недели оплат нет." />
          </section>

          <label className="toggle light sync-toggle">
            <input type="checkbox" checked={sync} onChange={async (e) => { setSync(e.target.checked); await saveSettings(userId, { sync_earnings: e.target.checked }); if (e.target.checked) flash("Доход месяца теперь в профиле"); }} />
            <span className="knob" />
            <span>Показывать доход этого месяца в плашке «Сколько ты заработал» в профиле</span>
          </label>
        </div>
      )}

      {tab === "ops" && (
        <div key={`p-${month}`} className="fin-pane"><Operations txs={txs.filter((t) => monthKey(t.date) === month)} clients={clients} month={month} onAdd={addTx} onDelete={delTx} /></div>
      )}

      {tab === "schedule" && (
        <div key="s" className="fin-pane"><Schedule pays={pays} clients={clients} userId={userId} onPaid={markPaid} onChange={load} /></div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** Мини-график прибыли за 6 месяцев: одна серия, ноль отмечен */
function Spark({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 220, H = 70, P = 6;
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => P + (i / Math.max(values.length - 1, 1)) * (W - P * 2);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - P * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values[values.length - 1] ?? 0;
  return (
    <div className="spark" title="Прибыль по месяцам">
      <svg viewBox={`0 0 ${W} ${H}`} aria-label="Прибыль за 6 месяцев" role="img">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="spark-zero" />
        <polygon points={`${x(0)},${y(0)} ${pts} ${x(values.length - 1)},${y(0)}`} className="spark-area" />
        <polyline points={pts} className="spark-line" />
        <circle cx={x(values.length - 1)} cy={y(last)} r="4.5" className="spark-dot" />
      </svg>
      <span className="spark-caption mono">{labels[0]} → {labels[labels.length - 1]} · {rub(last, true)}</span>
    </div>
  );
}

function Operations({ txs, clients, month, onAdd, onDelete }: {
  txs: Tx[]; clients: Pick<Client, "id" | "username">[]; month: string;
  onAdd: (t: Omit<Tx, "id">) => void; onDelete: (id: string) => void;
}) {
  const [type, setType] = useState<Tx["type"]>("income");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(today());
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"all" | Tx["type"]>("all");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = num(amount);
    if (v <= 0) return;
    onAdd({ type, amount: v, category: category || (type === "income" ? "Клиенты" : "Другое"), date, note: note.trim(), client_id: clientId || null });
    setAmount(""); setNote("");
  };

  const list = txs.filter((t) => filter === "all" || t.type === filter);
  const days = [...new Set(list.map((t) => t.date))];

  return (
    <>
      <form className={`tx-form card ${type}`} onSubmit={submit}>
        <div className="seg small">
          <button type="button" className="seg-item" aria-current={type === "income" ? "page" : undefined} onClick={() => { setType("income"); setCategory(""); }}>+ Доход</button>
          <button type="button" className="seg-item" aria-current={type === "expense" ? "page" : undefined} onClick={() => { setType("expense"); setCategory(""); }}>− Расход</button>
        </div>
        <div className="tx-fields">
          <div className="input amount"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s.,]/g, ""))} placeholder="0" aria-label="Сумма" /><span className="at">₽</span></div>
          <div className="input">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Категория">
              <option value="">Категория</option>
              {CATS[type].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="input"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Дата" /></div>
          {clients.length > 0 && (
            <div className="input">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Клиент">
                <option value="">Без клиента</option>
                {clients.map((c) => <option key={c.id} value={c.id}>@{c.username}</option>)}
              </select>
            </div>
          )}
          <div className="input grow"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Комментарий" aria-label="Комментарий" /></div>
          <button className="btn" type="submit" disabled={num(amount) <= 0}>Записать</button>
        </div>
      </form>

      <div className="section-head">
        <div className="filters">
          {([["all", "Все"], ["income", "Доходы"], ["expense", "Расходы"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={`fchip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn ghost sm" disabled={!list.length} onClick={() => download(`finance-${month}.csv`, toCsv([
          ["Дата", "Тип", "Сумма", "Категория", "Клиент", "Комментарий"],
          ...list.map((t) => [t.date, t.type === "income" ? "Доход" : "Расход", String(t.amount), t.category, clients.find((c) => c.id === t.client_id)?.username ?? "", t.note]),
        ]))}>Экспорт CSV</button>
      </div>

      {days.length ? days.map((d) => {
        const items = list.filter((t) => t.date === d);
        const total = items.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
        return (
          <section key={d} className="tx-day" style={{ "--i": days.indexOf(d) } as React.CSSProperties}>
            <header><span>{dayLabel(d)}</span><b className={total < 0 ? "neg" : "pos"}>{rub(total, true)}</b></header>
            <ul>
              {items.map((t) => (
                <li key={t.id} className={`tx ${t.type}`}>
                  <i className="tx-dot" style={{ background: t.type === "income" ? INCOME : EXPENSE }} />
                  <span className="tx-main"><b>{t.category || "Без категории"}</b><small>{[clients.find((c) => c.id === t.client_id) && "@" + clients.find((c) => c.id === t.client_id)!.username, t.note].filter(Boolean).join(" · ")}</small></span>
                  <span className="tx-sum">{t.type === "income" ? "+" : "−"}{rub(t.amount)}</span>
                  <button type="button" className="icon-btn sm ghosty" onClick={() => onDelete(t.id)} aria-label="Удалить операцию">×</button>
                </li>
              ))}
            </ul>
          </section>
        );
      }) : <div className="empty"><p className="lead">В этом месяце операций нет. Запиши первый доход или расход формой выше.</p></div>}
    </>
  );
}

function Schedule({ pays, clients, userId, onPaid, onChange }: {
  pays: Payment[]; clients: Pick<Client, "id" | "username">[]; userId: string; onPaid: (p: Payment) => void; onChange: () => void;
}) {
  const [f, setF] = useState({ direction: "in" as Payment["direction"], title: "", amount: "", due_date: today(), repeat: "" as Payment["repeat"], client_id: "" });
  const td = today(), week = iso(addDays(new Date(), 7));
  const planned = pays.filter((p) => p.status === "planned");
  const groups = [
    { id: "overdue", label: "Просрочено", items: planned.filter((p) => p.due_date < td) },
    { id: "week", label: "На этой неделе", items: planned.filter((p) => p.due_date >= td && p.due_date <= week) },
    { id: "later", label: "Позже", items: planned.filter((p) => p.due_date > week) },
    { id: "paid", label: "Оплачено", items: pays.filter((p) => p.status === "paid").reverse().slice(0, 20) },
  ].filter((g) => g.items.length);

  const sum = (dir: Payment["direction"]) => planned.filter((p) => p.direction === dir).reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <div className="fin-tiles three">
        <div className="fin-tile"><span className="label"><i style={{ background: INCOME }} />Должны мне</span><b><Money v={sum("in")} /></b></div>
        <div className="fin-tile"><span className="label"><i style={{ background: EXPENSE }} />Должен я</span><b><Money v={sum("out")} /></b></div>
        <div className="fin-tile"><span className="label">Баланс ожиданий</span><b><Money v={sum("in") - sum("out")} sign /></b></div>
      </div>

      <form className="tx-form card" onSubmit={async (e) => {
        e.preventDefault();
        const amount = num(f.amount);
        if (!f.title.trim() || amount <= 0) return;
        await supabase.from("fin_payments").insert({ user_id: userId, direction: f.direction, title: f.title.trim(), amount, due_date: f.due_date, repeat: f.repeat, client_id: f.client_id || null });
        setF({ ...f, title: "", amount: "" });
        onChange();
      }}>
        <div className="seg small">
          <button type="button" className="seg-item" aria-current={f.direction === "in" ? "page" : undefined} onClick={() => setF({ ...f, direction: "in" })}>Мне заплатят</button>
          <button type="button" className="seg-item" aria-current={f.direction === "out" ? "page" : undefined} onClick={() => setF({ ...f, direction: "out" })}>Я заплачу</button>
        </div>
        <div className="tx-fields">
          <div className="input grow"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} placeholder={f.direction === "in" ? "Предоплата за монтаж" : "Аренда, подписка Adobe"} aria-label="За что" /></div>
          <div className="input amount"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d\s.,]/g, "") })} placeholder="0" aria-label="Сумма" /><span className="at">₽</span></div>
          <div className="input"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} aria-label="Когда" /></div>
          <div className="input">
            <select value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value as Payment["repeat"] })} aria-label="Повтор">
              <option value="">Разово</option><option value="weekly">Каждую неделю</option><option value="monthly">Каждый месяц</option><option value="yearly">Каждый год</option>
            </select>
          </div>
          {f.direction === "in" && clients.length > 0 && (
            <div className="input">
              <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} aria-label="Клиент">
                <option value="">Без клиента</option>
                {clients.map((c) => <option key={c.id} value={c.id}>@{c.username}</option>)}
              </select>
            </div>
          )}
          <button className="btn" type="submit" disabled={!f.title.trim() || num(f.amount) <= 0}>В график</button>
        </div>
      </form>

      {groups.length ? groups.map((g) => (
        <section key={g.id} className={`pay-group g-${g.id}`}>
          <div className="plan-group-head"><span>{g.label}</span><em>{g.items.length}</em></div>
          <PaymentList items={g.items} clients={clients} onPaid={g.id === "paid" ? null : onPaid}
            onDelete={async (id) => { await supabase.from("fin_payments").delete().eq("id", id); onChange(); }} empty="" />
        </section>
      )) : <div className="empty"><p className="lead">Добавь ожидаемые оплаты от клиентов и свои регулярные платежи. Когда деньги придут, нажми «Оплачено», и операция сама запишется в доходы или расходы.</p></div>}
    </>
  );
}

function PaymentList({ items, clients, onPaid, onDelete, empty }: {
  items: Payment[]; clients: Pick<Client, "id" | "username">[]; onPaid: ((p: Payment) => void) | null; onDelete: ((id: string) => void) | null; empty: string;
}) {
  const [paying, setPaying] = useState<string | null>(null);
  if (!items.length) return empty ? <p className="lead small">{empty}</p> : null;
  const td = today();
  return (
    <ul className="pays">
      {items.map((p) => {
        const client = clients.find((c) => c.id === p.client_id);
        const late = p.status === "planned" && p.due_date < td;
        return (
          <li key={p.id} className={`pay ${p.direction} ${p.status} ${late ? "late" : ""} ${paying === p.id ? "paying" : ""}`}>
            <span className="pay-date"><b>{new Date(p.due_date + "T00:00:00").getDate()}</b><small>{new Date(p.due_date + "T00:00:00").toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</small></span>
            <span className="tx-main">
              <b>{p.title}</b>
              <small>{[p.direction === "in" ? "Входящий" : "Исходящий", client && "@" + client.username, p.repeat && { weekly: "каждую неделю", monthly: "каждый месяц", yearly: "каждый год" }[p.repeat], late && "просрочено"].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="tx-sum" style={{ color: "var(--ink)" }}><i className="tx-dot" style={{ background: p.direction === "in" ? INCOME : EXPENSE }} />{p.direction === "in" ? "+" : "−"}{rub(p.amount)}</span>
            {onPaid && <button type="button" className="btn sm" disabled={paying === p.id} onClick={() => { setPaying(p.id); setTimeout(() => onPaid(p), 450); }}>{paying === p.id ? "✓" : "Оплачено"}</button>}
            {onDelete && <button type="button" className="icon-btn sm ghosty" onClick={() => onDelete(p.id)} aria-label="Удалить платёж">×</button>}
          </li>
        );
      })}
    </ul>
  );
}
