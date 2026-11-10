"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type Tab = "list" | "stats" | "plan";
type Cl = Pick<Client, "id" | "username">;

const CATS = {
  income: ["Клиенты", "Продажи", "Зарплата", "Партнёрка", "Инвестиции", "Другое"],
  expense: ["Реклама", "Софт и подписки", "Подрядчики", "Оборудование", "Обучение", "Налоги", "Жильё", "Еда", "Транспорт", "Другое"],
};
const ICON: Record<string, string> = {
  "Клиенты": "💼", "Продажи": "🛒", "Зарплата": "💳", "Партнёрка": "🤝", "Инвестиции": "📈",
  "Реклама": "📣", "Софт и подписки": "💻", "Подрядчики": "👥", "Оборудование": "🎧", "Обучение": "📚",
  "Налоги": "🧾", "Жильё": "🏠", "Еда": "🍔", "Транспорт": "🚕", "Другое": "•",
};
const icon = (c: string) => ICON[c] ?? "•";

const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (key: string, long = false) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ru-RU", long ? { month: "long", year: "numeric" } : { month: "short" }).replace(".", "").replace(/\s?г$/, "").replace(/^./, (c) => c.toUpperCase());
};
const shiftMonth = (key: string, n: number) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
const dayLabel = (d: string) => {
  if (d === today()) return "Сегодня";
  if (d === iso(addDays(new Date(), -1))) return "Вчера";
  return new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" }).replace(/^./, (c) => c.toUpperCase());
};
const num = (s: string) => Math.round(parseFloat(s.replace(/\s/g, "").replace(",", ".")) * 100) / 100 || 0;
const sumOf = (l: Tx[], t: Tx["type"]) => l.filter((x) => x.type === t).reduce((s, x) => s + x.amount, 0);

function nextDate(d: string, r: Payment["repeat"]) {
  const x = new Date(d + "T00:00:00");
  if (r === "weekly") return iso(addDays(x, 7));
  if (r === "monthly") x.setMonth(x.getMonth() + 1);
  if (r === "yearly") x.setFullYear(x.getFullYear() + 1);
  return iso(x);
}

/** Финансы: быстро записать операцию, видеть весь список, искать и править; куда уходят деньги; ожидаемые оплаты */
export function Finance({ userId }: { userId: string }) {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>("list");
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [pays, setPays] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Cl[]>([]);
  const [month, setMonth] = useState<string>(() => today().slice(0, 7)); // "all" — всё время
  const [sync, setSync] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const flash = (text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 5000 : 2500);
  };

  // Доход за текущий месяц уходит в плашку «Сколько ты заработал», если включено
  useEffect(() => {
    if (!sync || !txs) return;
    const cur = today().slice(0, 7);
    const amount = Math.round(txs.filter((t) => t.type === "income" && monthKey(t.date) === cur).reduce((s, t) => s + t.amount, 0));
    supabase.from("earnings").update({ amount }).eq("user_id", userId);
  }, [sync, txs, userId]);

  const sortTx = (l: Tx[]) => [...l].sort((a, b) => b.date.localeCompare(a.date));

  async function addTx(row: Omit<Tx, "id">) {
    const { data, error } = await supabase.from("fin_transactions").insert(row).select("*").single();
    if (error || !data) return flash("Не получилось сохранить");
    setTxs((p) => sortTx([{ ...(data as Tx), amount: Number(data.amount) }, ...(p ?? [])]));
    flash(row.type === "income" ? `+${rub(row.amount)} записано` : `−${rub(row.amount)} записано`);
  }

  async function saveTx(t: Tx) {
    setTxs((p) => sortTx((p ?? []).map((x) => (x.id === t.id ? t : x))));
    const { id, ...rest } = t;
    const { error } = await supabase.from("fin_transactions").update(rest).eq("id", id);
    flash(error ? "Не получилось сохранить" : "Сохранено");
  }

  async function delTx(t: Tx) {
    setTxs((p) => (p ?? []).filter((x) => x.id !== t.id));
    await supabase.from("fin_transactions").delete().eq("id", t.id);
    const { id: _id, ...rest } = t;
    flash("Операция удалена", async () => { setToast(null); await addTx(rest); });
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

  if (!txs) return <div className="skeleton profile-skeleton" />;

  const all = month === "all";
  const inPeriod = all ? txs : txs.filter((t) => monthKey(t.date) === month);
  const income = sumOf(inPeriod, "income"), expense = sumOf(inPeriod, "expense");
  const prev = all ? [] : txs.filter((t) => monthKey(t.date) === shiftMonth(month, -1));
  const prevExpense = sumOf(prev, "expense");
  const balance = txs.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const overdue = pays.filter((p) => p.status === "planned" && p.due_date < today());
  const soon = pays.filter((p) => p.status === "planned" && p.due_date <= iso(addDays(new Date(), 7)));

  return (
    <div className="ws-section fn">
      <section className="fn-head">
        <div className="fn-period">
          {!all && <button type="button" className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Предыдущий месяц">‹</button>}
          <b>{all ? "Всё время" : monthLabel(month, true)}</b>
          {!all && <button type="button" className="icon-btn sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Следующий месяц">›</button>}
          <button type="button" className={`fchip ${all ? "on" : ""}`} onClick={() => setMonth(all ? today().slice(0, 7) : "all")}>{all ? "По месяцам" : "Всё время"}</button>
        </div>
        <div className="fn-nums">
          <div className="fn-num in"><small>Доход</small><b><Money v={income} /></b></div>
          <div className="fn-num out"><small>Расход</small><b><Money v={expense} /></b>{!all && prevExpense > 0 && <em>{expense <= prevExpense ? "▼" : "▲"} {Math.round(Math.abs(expense - prevExpense) / prevExpense * 100)}% к {monthLabel(shiftMonth(month, -1))}</em>}</div>
          <div className={`fn-num total ${income - expense < 0 ? "neg" : ""}`}><small>Итог</small><b><Money v={income - expense} sign /></b></div>
        </div>
        <p className="fn-balance">На счету по всем операциям: <b className={balance < 0 ? "neg" : ""}>{rub(balance, true)}</b>{soon.length > 0 && <> · <button type="button" className="link-btn" onClick={() => setTab("plan")}>{soon.length} {soon.length === 1 ? "оплата" : "оплат"} на неделе</button></>}</p>
      </section>

      <QuickAdd clients={clients} onAdd={addTx} focus={sp.get("ops") === "1"} />

      <div className="seg small fn-tabs" role="tablist" aria-label="Финансы">
        {([["list", "Операции"], ["stats", "Куда уходят деньги"], ["plan", "Ожидаемые оплаты"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" className="seg-item" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            {l}{k === "plan" && overdue.length > 0 && <span className="count-badge">{overdue.length}</span>}
          </button>
        ))}
      </div>

      {tab === "list" && <OpList key={month} txs={inPeriod} clients={clients} period={all ? "all" : month} onSave={saveTx} onDelete={delTx} />}
      {tab === "stats" && (
        <Stats txs={txs} inPeriod={inPeriod} month={month} clients={clients} onPick={setMonth}
          sync={sync} onSync={async (on) => { setSync(on); await saveSettings(userId, { sync_earnings: on }); if (on) flash("Доход месяца теперь в профиле"); }} />
      )}
      {tab === "plan" && <Schedule pays={pays} clients={clients} userId={userId} onPaid={markPaid} onChange={load} />}

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.undo && <button type="button" className="toast-undo" onClick={toast.undo}>Вернуть</button>}
        </div>
      )}
    </div>
  );
}

/** Быстрая запись: сумма, категория одним нажатием, Enter */
function QuickAdd({ clients, onAdd, focus }: { clients: Cl[]; onAdd: (t: Omit<Tx, "id">) => void; focus: boolean }) {
  const [type, setType] = useState<Tx["type"]>(() => { try { return (localStorage.getItem("fin:type") as Tx["type"]) || "expense"; } catch { return "expense"; } });
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [clientId, setClientId] = useState("");
  const [more, setMore] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus) input.current?.focus(); }, [focus]);

  const pick = (t: Tx["type"]) => { setType(t); setCategory(""); try { localStorage.setItem("fin:type", t); } catch {} input.current?.focus(); };
  const v = num(amount);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (v <= 0) return input.current?.focus();
    onAdd({ type, amount: v, category: category || (type === "income" ? "Клиенты" : "Другое"), date, note: note.trim(), client_id: type === "income" ? clientId || null : null });
    setAmount(""); setNote(""); setCategory("");
    input.current?.focus();
  };

  return (
    <form className={`fn-add ${type}`} onSubmit={submit}>
      <div className="fn-add-row">
        <div className="fn-type" role="group" aria-label="Тип операции">
          <button type="button" aria-pressed={type === "expense"} onClick={() => pick("expense")}>− Расход</button>
          <button type="button" aria-pressed={type === "income"} onClick={() => pick("income")}>+ Доход</button>
        </div>
        <label className="fn-amount">
          <input ref={input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s.,]/g, ""))} placeholder="0" aria-label="Сумма" />
          <span>₽</span>
        </label>
        <input className="fn-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={type === "income" ? "За что, например «Монтаж для @ivan»" : "На что, например «Figma»"} aria-label="Комментарий" />
        <button className="btn fn-go" type="submit" disabled={v <= 0}>Записать</button>
      </div>
      <div className="fn-cats">
        {CATS[type].map((c) => (
          <button key={c} type="button" className={`fn-cat ${category === c ? "on" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
            <i>{icon(c)}</i>{c}
          </button>
        ))}
        <button type="button" className="fn-more" onClick={() => setMore(!more)} aria-expanded={more}>{date !== today() ? new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "Дата"}{type === "income" && clientId ? " · клиент" : ""} ▾</button>
      </div>
      {more && (
        <div className="fn-extra">
          <label><span>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} /></label>
          {type === "income" && clients.length > 0 && (
            <label><span>Клиент</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Без клиента</option>
                {clients.map((c) => <option key={c.id} value={c.id}>@{c.username}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </form>
  );
}

/** Список всех операций: поиск, фильтры, по дням; нажми на операцию, чтобы поправить */
function OpList({ txs, clients, period, onSave, onDelete }: {
  txs: Tx[]; clients: Cl[]; period: string; onSave: (t: Tx) => void; onDelete: (t: Tx) => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | Tx["type"]>("all");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const cname = (id: string | null) => clients.find((c) => c.id === id)?.username ?? "";

  const cats = useMemo(() => [...new Set(txs.map((t) => t.category).filter(Boolean))].sort(), [txs]);
  const list = useMemo(() => {
    const w = q.trim().toLowerCase();
    return txs.filter((t) => (type === "all" || t.type === type) && (!cat || t.category === cat)
      && (!w || `${t.note} ${t.category} ${cname(t.client_id)} ${t.amount}`.toLowerCase().includes(w)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, q, type, cat, clients]);
  const shown = list.slice(0, limit);
  const days = [...new Set(shown.map((t) => t.date))];
  const found = list.length !== txs.length;

  return (
    <section className="fn-list">
      <div className="fn-tools">
        <div className="input fn-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: комментарий, категория, клиент, сумма" aria-label="Поиск по операциям" /></div>
        <div className="filters">
          {([["all", "Все"], ["income", "Доходы"], ["expense", "Расходы"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={`fchip ${type === k ? "on" : ""}`} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
        {cats.length > 1 && (
          <select className="mini-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Категория">
            <option value="">Все категории</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button type="button" className="btn ghost sm" disabled={!list.length} onClick={() => download(`finance-${period}.csv`, toCsv([
          ["Дата", "Тип", "Сумма", "Категория", "Клиент", "Комментарий"],
          ...list.map((t) => [t.date, t.type === "income" ? "Доход" : "Расход", String(t.amount), t.category, cname(t.client_id), t.note]),
        ]))}>Скачать CSV</button>
      </div>

      {found && <p className="fn-found">Найдено {list.length}: доход {rub(sumOf(list, "income"))}, расход {rub(sumOf(list, "expense"))}</p>}

      {days.length ? days.map((d) => {
        const items = shown.filter((t) => t.date === d);
        const total = items.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
        return (
          <div key={d} className="fn-day">
            <header><span>{dayLabel(d)}</span><b className={total < 0 ? "neg" : "pos"}>{rub(total, true)}</b></header>
            <ul>
              {items.map((t) => open === t.id ? (
                <li key={t.id} className="fn-edit-li"><TxEdit t={t} clients={clients} onSave={(x) => { onSave(x); setOpen(null); }} onDelete={() => { onDelete(t); setOpen(null); }} onClose={() => setOpen(null)} /></li>
              ) : (
                <li key={t.id}>
                  <button type="button" className={`fn-op ${t.type}`} onClick={() => setOpen(t.id)}>
                    <i className="fn-ico">{icon(t.category)}</i>
                    <span className="fn-op-t"><b>{t.note || t.category || "Без категории"}</b><small>{[t.note ? t.category : "", cname(t.client_id) && "@" + cname(t.client_id)].filter(Boolean).join(" · ") || (t.type === "income" ? "Доход" : "Расход")}</small></span>
                    <span className="fn-op-sum">{t.type === "income" ? "+" : "−"}{rub(t.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      }) : (
        <div className="fn-empty">
          <b>{txs.length ? "Ничего не нашли" : "Операций пока нет"}</b>
          <p>{txs.length ? "Попробуй другой запрос или сбрось фильтры." : "Запиши первый доход или расход в поле выше — сумма, категория, Enter. Здесь появится список всех твоих операций."}</p>
        </div>
      )}
      {list.length > limit && <button type="button" className="btn ghost fn-more-btn" onClick={() => setLimit(limit + 100)}>Показать ещё {Math.min(100, list.length - limit)}</button>}
    </section>
  );
}

function TxEdit({ t, clients, onSave, onDelete, onClose }: { t: Tx; clients: Cl[]; onSave: (t: Tx) => void; onDelete: () => void; onClose: () => void }) {
  const [x, setX] = useState({ ...t, amountS: String(t.amount) });
  const cats = CATS[x.type].includes(x.category) || !x.category ? CATS[x.type] : [x.category, ...CATS[x.type]];
  return (
    <form className="fn-edit" onSubmit={(e) => { e.preventDefault(); const a = num(x.amountS); if (a <= 0) return; const { amountS: _a, ...rest } = x; onSave({ ...rest, amount: a, client_id: x.type === "income" ? x.client_id : null }); }}>
      <div className="fn-type" role="group" aria-label="Тип">
        <button type="button" aria-pressed={x.type === "expense"} onClick={() => setX({ ...x, type: "expense", category: "" })}>− Расход</button>
        <button type="button" aria-pressed={x.type === "income"} onClick={() => setX({ ...x, type: "income", category: "" })}>+ Доход</button>
      </div>
      <div className="fn-edit-grid">
        <label><span>Сумма</span><div className="input"><input inputMode="decimal" value={x.amountS} onChange={(e) => setX({ ...x, amountS: e.target.value.replace(/[^\d\s.,]/g, "") })} autoFocus /></div></label>
        <label><span>Категория</span><div className="input"><select value={x.category} onChange={(e) => setX({ ...x, category: e.target.value })}><option value="">Без категории</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div></label>
        <label><span>Дата</span><div className="input"><input type="date" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value || x.date })} /></div></label>
        {x.type === "income" && clients.length > 0 && (
          <label><span>Клиент</span><div className="input"><select value={x.client_id ?? ""} onChange={(e) => setX({ ...x, client_id: e.target.value || null })}><option value="">Без клиента</option>{clients.map((c) => <option key={c.id} value={c.id}>@{c.username}</option>)}</select></div></label>
        )}
        <label className="wide"><span>Комментарий</span><div className="input"><input value={x.note} maxLength={300} onChange={(e) => setX({ ...x, note: e.target.value })} /></div></label>
      </div>
      <div className="fn-edit-act">
        <button type="submit" className="btn sm">Сохранить</button>
        <button type="button" className="btn ghost sm" onClick={onClose}>Отмена</button>
        <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>Удалить</button>
      </div>
    </form>
  );
}

/** Куда уходят деньги: по месяцам, по категориям, по клиентам */
function Stats({ txs, inPeriod, month, clients, onPick, sync, onSync }: {
  txs: Tx[]; inPeriod: Tx[]; month: string; clients: Cl[]; onPick: (m: string) => void; sync: boolean; onSync: (on: boolean) => void;
}) {
  const base = month === "all" ? today().slice(0, 7) : month;
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(base, i - 5)).map((key) => {
    const m = txs.filter((t) => monthKey(t.date) === key);
    return { key, label: monthLabel(key), income: sumOf(m, "income"), expense: sumOf(m, "expense") };
  });
  const group = (type: Tx["type"], keyOf: (t: Tx) => string) => {
    const map = new Map<string, number>();
    inPeriod.filter((t) => t.type === type).forEach((t) => map.set(keyOf(t), (map.get(keyOf(t)) ?? 0) + t.amount));
    return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  };
  const byCat = group("expense", (t) => t.category || "Другое");
  const byClient = group("income", (t) => { const c = clients.find((x) => x.id === t.client_id); return c ? `@${c.username}` : "Без клиента"; });
  const expense = sumOf(inPeriod, "expense");
  const top = [...inPeriod].filter((t) => t.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 3);
  const daysN = month === "all" ? Math.max(1, new Set(inPeriod.map((t) => t.date)).size) : month === today().slice(0, 7) ? new Date().getDate() : new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();

  return (
    <div className="fn-stats">
      <section className="card">
        <div className="section-head"><div className="label">Последние 6 месяцев</div><span className="hint">Нажми на месяц, чтобы открыть его</span></div>
        <MonthBars data={months} active={month} onPick={onPick} />
      </section>
      <div className="grid2">
        <section className="card">
          <div className="label">Расходы по категориям</div>
          {byCat.length > 0 && <p className="fn-hint">В среднем {rub(expense / daysN)} в день</p>}
          <HBars rows={byCat.map((r) => ({ ...r, label: `${icon(r.label)} ${r.label} · ${Math.round((r.value / (expense || 1)) * 100)}%` }))} color={EXPENSE} empty="Расходов за этот период нет." />
        </section>
        <section className="card"><div className="label">Доход по клиентам</div><HBars rows={byClient} color={INCOME} empty="Доходов за этот период нет." /></section>
      </div>
      {top.length > 0 && (
        <section className="card">
          <div className="label">Самые крупные траты</div>
          <ul className="fn-top">
            {top.map((t) => <li key={t.id}><i>{icon(t.category)}</i><span><b>{t.note || t.category}</b><small>{dayLabel(t.date)}</small></span><em>−{rub(t.amount)}</em></li>)}
          </ul>
        </section>
      )}
      <label className="toggle light sync-toggle">
        <input type="checkbox" checked={sync} onChange={(e) => onSync(e.target.checked)} />
        <span className="knob" />
        <span>Показывать доход этого месяца в плашке «Сколько ты заработал» в профиле</span>
      </label>
    </div>
  );
}

function Schedule({ pays, clients, userId, onPaid, onChange }: {
  pays: Payment[]; clients: Cl[]; userId: string; onPaid: (p: Payment) => void; onChange: () => void;
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
      <div className="fn-nums three">
        <div className="fn-num in"><small>Должны мне</small><b><Money v={sum("in")} /></b></div>
        <div className="fn-num out"><small>Должен я</small><b><Money v={sum("out")} /></b></div>
        <div className="fn-num total"><small>Разница</small><b><Money v={sum("in") - sum("out")} sign /></b></div>
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
          <button className="btn" type="submit" disabled={!f.title.trim() || num(f.amount) <= 0}>Добавить</button>
        </div>
      </form>

      {groups.length ? groups.map((g) => (
        <section key={g.id} className={`pay-group g-${g.id}`}>
          <div className="plan-group-head"><span>{g.label}</span><em>{g.items.length}</em></div>
          <PaymentList items={g.items} clients={clients} onPaid={g.id === "paid" ? null : onPaid}
            onDelete={async (id) => { await supabase.from("fin_payments").delete().eq("id", id); onChange(); }} />
        </section>
      )) : <div className="fn-empty"><b>Ожидаемых оплат нет</b><p>Добавь, кто и сколько тебе должен заплатить, и свои регулярные платежи. Когда деньги придут, нажми «Оплачено» — операция сама появится в списке.</p></div>}
    </>
  );
}

function PaymentList({ items, clients, onPaid, onDelete }: {
  items: Payment[]; clients: Cl[]; onPaid: ((p: Payment) => void) | null; onDelete: ((id: string) => void) | null;
}) {
  const [paying, setPaying] = useState<string | null>(null);
  if (!items.length) return null;
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
              <small>{[p.direction === "in" ? "Мне заплатят" : "Я заплачу", client && "@" + client.username, p.repeat && { weekly: "каждую неделю", monthly: "каждый месяц", yearly: "каждый год" }[p.repeat], late && "просрочено"].filter(Boolean).join(" · ")}</small>
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
