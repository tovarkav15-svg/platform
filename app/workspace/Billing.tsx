"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rub } from "@/lib/workspace";

type Entry = { id: string; client_id: string | null; title: string; started_at: string; ended_at: string | null; rate: number; invoice_id: string | null };
type Item = { title: string; qty: number; price: number };
type Invoice = { id: string; number: number; client_id: string | null; client_name: string; items: Item[]; total: number; status: "draft" | "sent" | "paid"; due_date: string | null; note: string; requisites: string; created_at: string; paid_at: string | null };
type ClientLite = { id: string; username: string };

const STATUS = { draft: "Черновик", sent: "Отправлен", paid: "Оплачен" } as const;
const mins = (e: Entry, now: number) => Math.max(0, ((e.ended_at ? new Date(e.ended_at).getTime() : now) - new Date(e.started_at).getTime()) / 60000);
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, "0")}`;
const clock = (m: number) => { const s = Math.floor(m * 60); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const money = (e: Entry, now: number) => (mins(e, now) / 60) * Number(e.rate);
const store = { get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };

/** Время и счета: таймер по задачам, счета клиентам, калькулятор ставки */
export function Billing({ userId, name }: { userId: string; name: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [now, setNow] = useState(Date.now());
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [rate, setRate] = useState("1500");
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [print, setPrint] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    const [e, i, c] = await Promise.all([
      supabase.from("time_entries").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
      supabase.from("invoices").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      supabase.from("clients").select("id, username").eq("user_id", userId).order("position"),
    ]);
    setEntries((e.data as Entry[]) ?? []);
    setInvoices((i.data as Invoice[]) ?? []);
    setClients(((c.data as ClientLite[]) ?? []).filter((x) => x.username));
  }, [userId]);

  useEffect(() => { load(); setRate(store.get("bill:rate", "1500")); }, [load]);
  const running = entries?.find((e) => !e.ended_at) ?? null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    store.set("bill:rate", rate);
    await supabase.from("time_entries").insert({ title: title.trim() || "Работа", client_id: client || null, rate: Number(rate) || 0 });
    setTitle("");
    load();
  }
  async function stop() {
    if (!running) return;
    await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("id", running.id);
    load();
  }
  async function remove(id: string) { await supabase.from("time_entries").delete().eq("id", id); load(); }

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.username ?? "";
  const done = (entries ?? []).filter((e) => e.ended_at);
  const weekStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }, []);
  const week = done.filter((e) => new Date(e.started_at).getTime() >= weekStart);
  const unbilled = done.filter((e) => !e.invoice_id);
  const weekMin = week.reduce((s, e) => s + mins(e, now), 0);
  const unpaid = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.total), 0);

  // Новый счёт: подтягиваем неоплаченные часы выбранного клиента
  function newInvoice(forClient: string) {
    const list = unbilled.filter((e) => (forClient ? e.client_id === forClient : true));
    const items: Item[] = list.length
      ? list.map((e) => ({ title: e.title || "Работа", qty: Math.round((mins(e, now) / 60) * 100) / 100, price: Number(e.rate) }))
      : [{ title: "", qty: 1, price: 0 }];
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setDraft({ id: "", number: (invoices[0]?.number ?? 0) + 1, client_id: forClient || null, client_name: clientName(forClient || null), items, total: 0, status: "draft", due_date: due, note: "", requisites: store.get("bill:req", `${name}\nКарта / счёт: \nТелефон: `), created_at: new Date().toISOString(), paid_at: null });
  }

  async function saveInvoice(inv: Invoice) {
    const items = inv.items.filter((x) => x.title.trim() || x.price);
    const total = items.reduce((s, x) => s + x.qty * x.price, 0);
    store.set("bill:req", inv.requisites);
    const { data, error } = await supabase.from("invoices").insert({
      number: inv.number, client_id: inv.client_id, client_name: inv.client_name.trim(), items, total, status: "draft", due_date: inv.due_date || null, note: inv.note, requisites: inv.requisites,
    }).select().single();
    if (error) return window.alert("Не получилось сохранить счёт. Проверь номер, он не должен повторяться.");
    const ids = unbilled.filter((e) => (inv.client_id ? e.client_id === inv.client_id : true)).map((e) => e.id);
    if (ids.length && inv.items.length) await supabase.from("time_entries").update({ invoice_id: (data as Invoice).id }).in("id", ids);
    setDraft(null);
    load();
  }

  async function setStatus(inv: Invoice, status: Invoice["status"]) {
    await supabase.from("invoices").update({ status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", inv.id);
    // Оплаченный счёт сразу попадает в доходы Finance
    if (status === "paid" && inv.status !== "paid") {
      await supabase.from("fin_transactions").insert({ type: "income", amount: Number(inv.total), category: "Счета", note: `Счёт №${inv.number}${inv.client_name ? ` · ${inv.client_name}` : ""}`, client_id: inv.client_id });
    }
    load();
  }
  async function removeInvoice(inv: Invoice) {
    if (!window.confirm(`Удалить счёт №${inv.number}? Часы снова станут «не выставлены».`)) return;
    await supabase.from("time_entries").update({ invoice_id: null }).eq("invoice_id", inv.id);
    await supabase.from("invoices").delete().eq("id", inv.id);
    load();
  }

  return (
    <div className="bl">
      <section className={`bl-timer ${running ? "on" : ""}`}>
        <div className="bl-clock">
          <span className="label">{running ? "Идёт работа" : "Таймер"}</span>
          <b className="mono">{running ? clock(mins(running, now)) : "00:00:00"}</b>
          {running && <small>{running.title}{running.client_id ? ` · ${clientName(running.client_id)}` : ""} · {rub(money(running, now))}</small>}
        </div>
        {running ? (
          <button type="button" className="bl-big stop" onClick={stop} aria-label="Остановить таймер"><i /></button>
        ) : (
          <form className="bl-start" onSubmit={(e) => { e.preventDefault(); start(); }}>
            <input className="bl-in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Над чем работаешь?" maxLength={120} />
            <select className="mini-select" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Клиент">
              <option value="">Без клиента</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
            </select>
            <label className="bl-rate"><input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} aria-label="Ставка в час" /><span>₽/час</span></label>
            <button type="submit" className="bl-big" aria-label="Запустить таймер"><i /></button>
          </form>
        )}
      </section>

      <div className="bl-stats">
        <div><span>За неделю</span><b className="mono">{hhmm(weekMin)}</b><small>часов</small></div>
        <div><span>Заработано за неделю</span><b className="mono">{rub(week.reduce((s, e) => s + money(e, now), 0))}</b></div>
        <div><span>Не выставлено</span><b className="mono">{rub(unbilled.reduce((s, e) => s + money(e, now), 0))}</b><small>{unbilled.length} записей</small></div>
        <div><span>Ждём оплату</span><b className="mono">{rub(unpaid)}</b><small>{invoices.filter((i) => i.status === "sent").length} счетов отправлено</small></div>
      </div>

      <div className="bl-cols">
        <section className="bl-card">
          <header><b>Записи времени</b><small>последние</small></header>
          {entries === null ? <div className="skeleton list-skeleton" /> : done.length === 0 ? <p className="bl-empty">Запусти таймер, когда садишься за работу. Время и деньги посчитаются сами.</p> : (
            <ul className="bl-entries">
              {done.slice(0, 30).map((e) => (
                <li key={e.id}>
                  <span><b>{e.title || "Работа"}</b><small>{new Date(e.started_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}{e.client_id ? ` · ${clientName(e.client_id)}` : ""}{e.invoice_id ? " · в счёте" : ""}</small></span>
                  <em className="mono">{hhmm(mins(e, now))}</em>
                  <b className="mono">{rub(money(e, now))}</b>
                  {!e.invoice_id && <button type="button" className="icon-btn sm" aria-label="Удалить запись" onClick={() => remove(e.id)}>×</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bl-card">
          <header>
            <b>Счета</b>
            <select className="mini-select" value="" onChange={(e) => { if (e.target.value) newInvoice(e.target.value === "_" ? "" : e.target.value); }} aria-label="Новый счёт">
              <option value="">+ Новый счёт</option>
              <option value="_">Без клиента / все часы</option>
              {clients.map((c) => <option key={c.id} value={c.id}>Для: {c.username}</option>)}
            </select>
          </header>
          {invoices.length === 0 ? <p className="bl-empty">Выстави счёт клиенту: часы из таймера подтянутся строками. Оплаченный счёт сам попадёт в Finance.</p> : (
            <ul className="bl-invoices">
              {invoices.map((inv) => (
                <li key={inv.id} className={`st-${inv.status}`}>
                  <span className="bl-no mono">№{inv.number}</span>
                  <span className="bl-inv-who"><b>{inv.client_name || "Клиент"}</b><small>{inv.due_date ? `до ${new Date(inv.due_date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : "без срока"}</small></span>
                  <b className="mono">{rub(Number(inv.total))}</b>
                  <span className={`bl-status s-${inv.status}`}>{STATUS[inv.status]}</span>
                  <span className="bl-inv-act">
                    {inv.status === "draft" && <button type="button" className="chip-btn" onClick={() => setStatus(inv, "sent")}>Отправлен</button>}
                    {inv.status !== "paid" && <button type="button" className="chip-btn" onClick={() => setStatus(inv, "paid")}>Оплачен</button>}
                    <button type="button" className="chip-btn" onClick={() => setPrint(inv)}>PDF</button>
                    <button type="button" className="icon-btn sm" aria-label="Удалить счёт" onClick={() => removeInvoice(inv)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <RateCalc onUse={(r) => { setRate(String(r)); store.set("bill:rate", String(r)); }} />

      {draft && <InvoiceEditor inv={draft} clients={clients} onChange={setDraft} onSave={() => saveInvoice(draft)} onClose={() => setDraft(null)} />}
      {print && <InvoicePrint inv={print} name={name} onClose={() => setPrint(null)} />}
    </div>
  );
}

function InvoiceEditor({ inv, clients, onChange, onSave, onClose }: { inv: Invoice; clients: ClientLite[]; onChange: (i: Invoice) => void; onSave: () => void; onClose: () => void }) {
  const set = (patch: Partial<Invoice>) => onChange({ ...inv, ...patch });
  const setItem = (k: number, patch: Partial<Item>) => set({ items: inv.items.map((x, i) => (i === k ? { ...x, ...patch } : x)) });
  const total = inv.items.reduce((s, x) => s + x.qty * x.price, 0);
  return (
    <div className="bl-modal" role="dialog" aria-label="Новый счёт" onClick={onClose}>
      <form className="bl-sheet" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <header><b>Счёт №<input className="bl-num mono" inputMode="numeric" value={inv.number} onChange={(e) => set({ number: Number(e.target.value.replace(/\D/g, "")) || 1 })} /></b><button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button></header>
        <div className="bl-grid2">
          <label className="field"><span>Клиент</span><input className="bl-in" list="bl-clients" value={inv.client_name} onChange={(e) => set({ client_name: e.target.value, client_id: clients.find((c) => c.username === e.target.value)?.id ?? inv.client_id })} placeholder="Имя или компания" /></label>
          <datalist id="bl-clients">{clients.map((c) => <option key={c.id} value={c.username} />)}</datalist>
          <label className="field"><span>Оплатить до</span><input className="bl-in" type="date" value={inv.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value })} /></label>
        </div>
        <div className="bl-lines">
          <div className="bl-line head"><span>Работа</span><span>Кол-во / часы</span><span>Цена</span><span>Сумма</span><span /></div>
          {inv.items.map((x, k) => (
            <div key={k} className="bl-line">
              <input className="bl-in" value={x.title} onChange={(e) => setItem(k, { title: e.target.value })} placeholder="Монтаж ролика" maxLength={120} />
              <input className="bl-in mono" inputMode="decimal" value={x.qty} onChange={(e) => setItem(k, { qty: Number(e.target.value.replace(",", ".")) || 0 })} />
              <input className="bl-in mono" inputMode="numeric" value={x.price} onChange={(e) => setItem(k, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              <b className="mono">{rub(x.qty * x.price)}</b>
              <button type="button" className="icon-btn sm" aria-label="Убрать строку" onClick={() => set({ items: inv.items.filter((_, i) => i !== k) })}>×</button>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => set({ items: [...inv.items, { title: "", qty: 1, price: 0 }] })}>+ Строка</button>
        </div>
        <div className="bl-total"><span>Итого</span><b className="mono">{rub(total)}</b></div>
        <label className="field"><span>Реквизиты для оплаты</span><textarea className="bl-in" rows={3} value={inv.requisites} onChange={(e) => set({ requisites: e.target.value })} maxLength={1000} /></label>
        <label className="field"><span>Комментарий</span><textarea className="bl-in" rows={2} value={inv.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} placeholder="Спасибо за работу!" /></label>
        <div className="save-row"><button type="submit" className="btn">Сохранить счёт</button><button type="button" className="btn ghost" onClick={onClose}>Отмена</button></div>
      </form>
    </div>
  );
}

/** Красивый счёт для печати или сохранения в PDF */
function InvoicePrint({ inv, name, onClose }: { inv: Invoice; name: string; onClose: () => void }) {
  return (
    <div className="bl-modal inv-wrap" role="dialog" aria-label={`Счёт №${inv.number}`} onClick={onClose}>
      <div className="inv-doc" onClick={(e) => e.stopPropagation()}>
        <div className="inv-top">
          <div><span className="inv-brand">Relic</span><h2>Счёт №{inv.number}</h2><small>от {new Date(inv.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</small></div>
          <div className="inv-sum"><small>К оплате</small><b className="mono">{rub(Number(inv.total))}</b>{inv.due_date && <small>до {new Date(inv.due_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</small>}</div>
        </div>
        <div className="inv-parties"><div><small>Исполнитель</small><b>{name}</b></div><div><small>Заказчик</small><b>{inv.client_name || "—"}</b></div></div>
        <table className="inv-table">
          <thead><tr><th>Работа</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
          <tbody>{inv.items.map((x, k) => <tr key={k}><td>{x.title}</td><td className="mono">{x.qty}</td><td className="mono">{rub(x.price)}</td><td className="mono">{rub(x.qty * x.price)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Итого</td><td className="mono">{rub(Number(inv.total))}</td></tr></tfoot>
        </table>
        {inv.requisites && <div className="inv-req"><small>Реквизиты</small><pre>{inv.requisites}</pre></div>}
        {inv.note && <p className="inv-note">{inv.note}</p>}
        <div className="inv-actions"><button type="button" className="btn" onClick={() => window.print()}>Печать / сохранить PDF</button><button type="button" className="btn ghost" onClick={onClose}>Закрыть</button></div>
      </div>
    </div>
  );
}

/** Сколько брать за час: из желаемого дохода, расходов и реальной загрузки */
function RateCalc({ onUse }: { onUse: (r: number) => void }) {
  const [income, setIncome] = useState(150000);
  const [costs, setCosts] = useState(15000);
  const [hours, setHours] = useState(5);
  const [days, setDays] = useState(5);
  const [rest, setRest] = useState(4);
  const yearHours = hours * days * (52 - rest);
  const min = yearHours ? Math.ceil((((income + costs) * 12) / yearHours) / 50) * 50 : 0;
  const safe = Math.ceil((min * 1.3) / 50) * 50;
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  return (
    <section className="bl-card bl-calc">
      <header><b>Сколько брать за час</b><small>посчитай честную ставку</small></header>
      <div className="bl-calc-grid">
        <label className="field"><span>Хочу зарабатывать в месяц, ₽</span><input className="bl-in mono" inputMode="numeric" value={income} onChange={(e) => setIncome(num(e.target.value))} /></label>
        <label className="field"><span>Расходы на работу в месяц, ₽</span><input className="bl-in mono" inputMode="numeric" value={costs} onChange={(e) => setCosts(num(e.target.value))} /></label>
        <label className="field"><span>Оплачиваемых часов в день</span><input type="range" min={1} max={12} value={hours} onChange={(e) => setHours(+e.target.value)} /><em>{hours} ч</em></label>
        <label className="field"><span>Рабочих дней в неделю</span><input type="range" min={1} max={7} value={days} onChange={(e) => setDays(+e.target.value)} /><em>{days} дн</em></label>
        <label className="field"><span>Недель отдыха в год</span><input type="range" min={0} max={12} value={rest} onChange={(e) => setRest(+e.target.value)} /><em>{rest} нед</em></label>
      </div>
      <div className="bl-calc-out">
        <div><small>Минимум</small><b className="mono">{rub(min)}<i>/час</i></b></div>
        <div className="hot"><small>С запасом +30% на простои и налоги</small><b className="mono">{rub(safe)}<i>/час</i></b></div>
        <button type="button" className="btn sm" onClick={() => onUse(safe)}>Поставить в таймер</button>
      </div>
      <p className="bl-empty">Это {yearHours.toLocaleString("ru-RU")} оплачиваемых часов в год. Помни: не всё рабочее время оплачивается — переписка, правки и поиск клиентов тоже занимают часы.</p>
    </section>
  );
}
