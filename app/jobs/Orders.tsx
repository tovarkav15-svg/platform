"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, PROFILE_CARD, type Profile, type ProfileCard } from "@/lib/supabase";
import { NICHES } from "@/lib/niches";
import { chatHref, profileHref } from "@/lib/links";
import { Modal } from "../Modal";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";
import { Stars, useRatings } from "../Reviews";
import { useLive } from "@/lib/live";

export type Order = {
  id: string; client_id: string; title: string; niche: string; description: string; budget_from: number; budget_to: number;
  deadline: string | null; status: "open" | "in_work" | "closed"; executor_id: string | null; mod_status: "pending" | "approved" | "rejected"; mod_note: string;
  created_at: string; updated_at: string; client?: ProfileCard;
};
type Response = { id: string; order_id: string; freelancer_id: string; message: string; price: number; days: number; status: "sent" | "accepted" | "declined"; created_at: string; freelancer?: ProfileCard; order?: Order };

const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;
export const budgetText = (o: Pick<Order, "budget_from" | "budget_to">) =>
  !o.budget_from && !o.budget_to ? "Бюджет обсуждается" : o.budget_from && o.budget_to && o.budget_from !== o.budget_to ? `${money(o.budget_from)} – ${money(o.budget_to)}` : money(o.budget_to || o.budget_from);
const nicheOf = (id: string) => NICHES.find((n) => n.id === id);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
};
const STATUS = { open: "Ищет исполнителя", in_work: "В работе", closed: "Закрыт" } as const;
const MOD = { pending: "На проверке", rejected: "Отклонён модерацией", approved: "" } as const;

/** Лента заказов: свежие сверху, сначала подходящие под твои ниши */
export function OrdersBoard({ me, onNew }: { me: Profile | null; onNew: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [niche, setNiche] = useState("");
  const [q, setQ] = useState("");
  const [minBudget, setMinBudget] = useState(0);
  const [respond, setRespond] = useState<Order | null>(null);
  const [open, setOpen] = useState<Order | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select(`*, client:profiles!orders_client_id_fkey(${PROFILE_CARD})`).neq("mod_status", "rejected").eq("status", "open").order("created_at", { ascending: false }).limit(150);
    const list = (data as unknown as Order[]) ?? [];
    setRows(list);
    if (list.length) {
      const { data: c } = await supabase.rpc("order_response_counts", { p_orders: list.map((o) => o.id) });
      setCounts(Object.fromEntries(((c as { order_id: string; n: number }[]) ?? []).map((x) => [x.order_id, x.n])));
    }
    if (me) {
      const { data: r } = await supabase.from("order_responses").select("order_id").eq("freelancer_id", me.id);
      setMine(new Set((r ?? []).map((x) => x.order_id)));
    }
  }, [me]);
  useEffect(() => { load(); }, [load]);
  useLive(["orders", "order_responses"], load);

  const myNiches = useMemo(() => new Set((me?.niches ?? "").split(",").filter(Boolean)), [me]);
  const view = (rows ?? []).filter((o) => (!niche || o.niche === niche) && (!q.trim() || (o.title + " " + o.description).toLowerCase().includes(q.trim().toLowerCase())) && Math.max(o.budget_to, o.budget_from) >= minBudget);
  const fit = view.filter((o) => myNiches.has(o.niche) && o.client_id !== me?.id);
  const rest = view.filter((o) => !fit.includes(o));

  const card = (o: Order, i: number) => (
    <OrderCard key={o.id} o={o} i={i} count={counts[o.id] ?? 0} responded={mine.has(o.id)} own={o.client_id === me?.id}
      onOpen={() => setOpen(o)} onRespond={() => (me ? setRespond(o) : router.push("/login"))} />
  );

  return (
    <section className="or">
      <div className="or-hero">
        <div>
          <h2>Заказы</h2>
          <p>Заказчики пишут, что нужно сделать и за сколько. Откликайся со своей ценой и сроком — заказчик выберет и сразу напишет тебе в чат.</p>
        </div>
        <button type="button" className="btn" onClick={onNew}>+ Разместить заказ</button>
      </div>
      <div className="or-tools">
        <div className="input or-search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Что нужно сделать: рилсы, сайт, логотип…" aria-label="Поиск заказов" /></div>
        <select className="mini-select" value={niche} onChange={(e) => setNiche(e.target.value)} aria-label="Ниша">
          <option value="">Все ниши</option>
          {NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
        <select className="mini-select" value={minBudget} onChange={(e) => setMinBudget(+e.target.value)} aria-label="Бюджет от">
          <option value={0}>Любой бюджет</option><option value={5000}>от 5 000 ₽</option><option value={20000}>от 20 000 ₽</option><option value={50000}>от 50 000 ₽</option><option value={100000}>от 100 000 ₽</option>
        </select>
      </div>

      {rows === null ? <div className="or-list">{[0, 1, 2].map((k) => <div key={k} className="skeleton or-ph" />)}</div> : view.length === 0 ? (
        <div className="pf-empty"><span className="pf-empty-art" aria-hidden="true"><i /><i /><i /></span><p className="lead">{rows.length ? "По этим фильтрам заказов нет." : "Заказов пока нет. Будь первым заказчиком — опиши задачу, и специалисты откликнутся."}</p><button type="button" className="btn" onClick={onNew}>+ Разместить заказ</button></div>
      ) : (
        <>
          {fit.length > 0 && (
            <>
              <div className="dv-sec-head"><h2>Подходит тебе</h2><span>По твоим нишам</span></div>
              <div className="or-list">{fit.map(card)}</div>
            </>
          )}
          {rest.length > 0 && (
            <>
              {fit.length > 0 && <div className="dv-sec-head"><h2>Все заказы</h2></div>}
              <div className="or-list">{rest.map(card)}</div>
            </>
          )}
        </>
      )}

      <OrderDetail o={open} onClose={() => setOpen(null)} count={open ? counts[open.id] ?? 0 : 0} responded={!!open && mine.has(open.id)} own={open?.client_id === me?.id}
        onRespond={() => { if (open) { setRespond(open); setOpen(null); } }} />
      <RespondDialog o={respond} onClose={() => setRespond(null)} onSent={() => { setRespond(null); load(); }} />
    </section>
  );
}

function OrderCard({ o, i, count, responded, own, onOpen, onRespond }: { o: Order; i: number; count: number; responded: boolean; own: boolean; onOpen: () => void; onRespond: () => void }) {
  const n = nicheOf(o.niche);
  return (
    <article className="or-card" style={{ "--c": n?.color ?? "#141414", "--i": Math.min(i, 12) } as React.CSSProperties}>
      <button type="button" className="or-main" onClick={onOpen}>
        <span className="or-top"><span className="or-niche"><i />{n?.title ?? "Другое"}</span><small>{ago(o.created_at)}</small></span>
        <b className="or-title">{o.title}</b>
        {o.description && <span className="or-desc">{o.description}</span>}
        <span className="or-facts">
          <em className="or-budget mono">{budgetText(o)}</em>
          {o.deadline && <em>до {new Date(o.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</em>}
          <em>{count ? `${count} ${count === 1 ? "отклик" : count < 5 ? "отклика" : "откликов"}` : "пока без откликов"}</em>
        </span>
      </button>
      <div className="or-foot">
        {o.client && <Link href={profileHref(o.client.username)} className="or-client"><Avatar name={o.client.display_name} avatar={o.client.avatar} accent={o.client.accent} size={26} userId={o.client.id} /><span>{o.client.display_name}</span></Link>}
        {own ? <span className="or-tag">Твой заказ</span> : responded ? <span className="or-tag ok">✓ Отклик отправлен</span> : <button type="button" className="btn sm" onClick={onRespond}>Откликнуться</button>}
      </div>
    </article>
  );
}

function OrderDetail({ o, onClose, count, responded, own, onRespond }: { o: Order | null; onClose: () => void; count: number; responded: boolean; own: boolean; onRespond: () => void }) {
  const n = o ? nicheOf(o.niche) : null;
  return (
    <Modal open={!!o} onClose={onClose} title={<>{o?.title}</>}>
      {o && (
        <div className="or-detail" style={{ "--c": n?.color ?? "#141414" } as React.CSSProperties}>
          <div className="or-facts big">
            <em className="or-niche"><i />{n?.title}</em>
            <em className="or-budget mono">{budgetText(o)}</em>
            {o.deadline && <em>срок до {new Date(o.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</em>}
            <em>{count} откликов</em>
          </div>
          {o.description ? <p className="or-full">{o.description}</p> : <p className="or-full muted">Заказчик не добавил описания — уточни детали в отклике.</p>}
          {o.client && <Link href={profileHref(o.client.username)} className="or-client big"><Avatar name={o.client.display_name} avatar={o.client.avatar} accent={o.client.accent} size={40} userId={o.client.id} /><span><b>{o.client.display_name}<RoleBadge role={o.client.role} small support={o.client.is_support} /></b><small>@{o.client.username} · заказчик</small></span></Link>}
          <div className="save-row">
            {own ? <span className="or-tag">Это твой заказ — отклики во вкладке «Мои заказы»</span> : responded ? <span className="or-tag ok">✓ Ты уже откликнулся</span> : <button type="button" className="btn" onClick={onRespond}>Откликнуться</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function RespondDialog({ o, onClose, onSent }: { o: Order | null; onClose: () => void; onSent: () => void }) {
  const [msg, setMsg] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (o) { setMsg(""); setPrice(o.budget_to ? String(o.budget_to) : ""); setDays(""); setErr(""); } }, [o]);
  async function send() {
    if (!o) return;
    if (msg.trim().length < 5) return setErr("Напиши пару предложений: почему ты и как сделаешь");
    setBusy(true);
    const { error } = await supabase.from("order_responses").insert({ order_id: o.id, message: msg.trim(), price: Number(price) || 0, days: Number(days) || 0 });
    setBusy(false);
    if (error) return setErr(error.message.includes("duplicate") ? "Ты уже откликался на этот заказ" : "Не получилось отправить. Возможно, заказ уже закрыт.");
    onSent();
  }
  return (
    <Modal open={!!o} onClose={onClose} title={<>Отклик на «{o?.title}»</>}>
      <div className="or-respond">
        <p className="or-hint">Заказчик увидит твой отклик, профиль, рейтинг и отзывы. Сильный отклик — это конкретика: как сделаешь, похожие работы, сроки.</p>
        <textarea className="bl-in" rows={5} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Здравствуйте! Делал похожее для… Предлагаю так: …" />
        <div className="tl-row3">
          <label className="field"><span>Твоя цена, ₽</span><input className="bl-in mono" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="25000" /></label>
          <label className="field"><span>Срок, дней</span><input className="bl-in mono" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="7" /></label>
        </div>
        {err && <span className="hint bad">{err}</span>}
        <div className="save-row"><button type="button" className="btn" disabled={busy} onClick={send}>{busy ? "Отправляю…" : "Отправить отклик"}</button></div>
      </div>
    </Modal>
  );
}

/** Новый или изменённый заказ */
export function OrderEditor({ open, order, onClose, onSaved }: { open: boolean; order: Order | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: "", niche: "montazh", description: "", from: "", to: "", deadline: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErr("");
    setF(order ? { title: order.title, niche: order.niche, description: order.description, from: order.budget_from ? String(order.budget_from) : "", to: order.budget_to ? String(order.budget_to) : "", deadline: order.deadline ?? "" }
      : { title: "", niche: "montazh", description: "", from: "", to: "", deadline: "" });
  }, [open, order]);
  async function save() {
    if (f.title.trim().length < 3) return setErr("Коротко напиши, что нужно сделать");
    const from = Number(f.from) || 0, to = Number(f.to) || 0;
    const row = { title: f.title.trim(), niche: f.niche, description: f.description.trim(), budget_from: Math.min(from || to, to || from), budget_to: Math.max(from, to), deadline: f.deadline || null };
    setBusy(true);
    const { error } = order ? await supabase.from("orders").update(row).eq("id", order.id) : await supabase.from("orders").insert(row);
    setBusy(false);
    if (error) return setErr("Не получилось сохранить");
    onSaved();
  }
  return (
    <Modal open={open} onClose={onClose} title={<>{order ? "Изменить заказ" : "Новый заказ"}</>}>
      <div className="or-edit">
        <label className="field"><span>Что нужно сделать</span><input className="bl-in" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Смонтировать 10 рилс для эксперта" /></label>
        <label className="field"><span>Ниша</span>
          <select className="mini-select" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })}>{NICHES.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select>
        </label>
        <label className="field"><span>Подробности</span><textarea className="bl-in" rows={5} maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Что есть сейчас, какой результат нужен, примеры, что важно" /></label>
        <div className="tl-row3">
          <label className="field"><span>Бюджет от, ₽</span><input className="bl-in mono" inputMode="numeric" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value.replace(/\D/g, "") })} placeholder="10000" /></label>
          <label className="field"><span>до, ₽</span><input className="bl-in mono" inputMode="numeric" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value.replace(/\D/g, "") })} placeholder="20000" /></label>
          <label className="field"><span>Срок</span><input className="bl-in" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
        </div>
        <p className="or-hint">Заказ сразу появится на Бирже. Модераторы проверяют заказы и убирают нарушающие правила.</p>
        {err && <span className="hint bad">{err}</span>}
        <div className="save-row"><button type="button" className="btn" disabled={busy} onClick={save}>{busy ? "Сохраняю…" : order ? "Сохранить" : "Опубликовать"}</button></div>
      </div>
    </Modal>
  );
}

/** Мои заказы как заказчика: отклики, выбор исполнителя, закрытие */
export function MyOrders({ me, onNew, onEdit }: { me: Profile; onNew: () => void; onEdit: (o: Order) => void }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [resp, setResp] = useState<Response[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select("*").eq("client_id", me.id).order("created_at", { ascending: false });
    const list = (data as Order[]) ?? [];
    setOrders(list);
    if (list.length) {
      const { data: r } = await supabase.from("order_responses").select(`*, freelancer:profiles!order_responses_freelancer_id_fkey(${PROFILE_CARD})`).in("order_id", list.map((o) => o.id)).order("created_at");
      setResp((r as unknown as Response[]) ?? []);
    }
  }, [me.id]);
  useEffect(() => { load(); }, [load]);
  // Новые отклики и изменения заказов прилетают сразу
  useLive(["orders", "order_responses"], load);
  const ratings = useRatings(resp.map((r) => r.freelancer_id));

  async function accept(r: Response) {
    if (!window.confirm(`Выбрать ${r.freelancer?.display_name} исполнителем? Остальным откликам придёт отказ.`)) return;
    const { data, error } = await supabase.rpc("accept_response", { p_response: r.id });
    if (error) return window.alert(error.message);
    router.push(chatHref(data as string));
  }
  async function decline(r: Response) { await supabase.rpc("decline_response", { p_response: r.id }); load(); }
  async function close(o: Order) { if (window.confirm("Закрыть заказ? Он пропадёт из ленты.")) { await supabase.from("orders").update({ status: "closed" }).eq("id", o.id); load(); } }
  async function remove(o: Order) { if (window.confirm("Удалить заказ вместе с откликами?")) { await supabase.from("orders").delete().eq("id", o.id); load(); } }

  if (orders === null) return <div className="skeleton list-skeleton" />;
  if (!orders.length) return <div className="pf-empty"><p className="lead">Ты ещё не размещал заказов. Опиши задачу — специалисты откликнутся со своими ценами и сроками.</p><button type="button" className="btn" onClick={onNew}>+ Разместить заказ</button></div>;
  return (
    <section className="or-mine">
      <div className="save-row"><button type="button" className="btn" onClick={onNew}>+ Новый заказ</button></div>
      {orders.map((o) => {
        const list = resp.filter((r) => r.order_id === o.id);
        return (
          <article key={o.id} className={`or-own s-${o.status}`}>
            <header>
              <div><b>{o.title}</b><small>{nicheOf(o.niche)?.title} · {budgetText(o)}{o.deadline ? ` · до ${new Date(o.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}` : ""}</small></div>
              <span className={`or-status s-${o.status}`}>{STATUS[o.status]}</span>
            </header>
            {o.mod_status === "rejected" && <div className="or-mod m-rejected">{MOD.rejected}{o.mod_note ? `: ${o.mod_note}` : ""} — исправь и сохрани заново</div>}
            <div className="or-own-actions">
              {o.status === "open" && <button type="button" className="chip-btn" onClick={() => onEdit(o)}>Изменить</button>}
              {o.status !== "closed" && <button type="button" className="chip-btn" onClick={() => close(o)}>{o.status === "in_work" ? "Работа сдана, закрыть" : "Закрыть"}</button>}
              <button type="button" className="chip-btn md-danger" onClick={() => remove(o)}>Удалить</button>
            </div>
            <div className="or-resps">
              <span className="label">Отклики · {list.length}</span>
              {list.length === 0 && <p className="or-hint">{o.mod_status !== "rejected" ? "Пока никто не откликнулся. Обычно первые отклики приходят в течение дня." : "Заказ скрыт модерацией."}</p>}
              {list.map((r) => {
                const rt = ratings[r.freelancer_id];
                return (
                  <div key={r.id} className={`or-resp st-${r.status}`}>
                    {r.freelancer && (
                      <Link href={profileHref(r.freelancer.username)} className="or-client big">
                        <Avatar name={r.freelancer.display_name} avatar={r.freelancer.avatar} accent={r.freelancer.accent} size={40} userId={r.freelancer.id} />
                        <span><b>{r.freelancer.display_name}</b><small>@{r.freelancer.username}{r.freelancer.headline ? ` · ${r.freelancer.headline}` : ""}</small>{rt && <small className="or-rt"><Stars value={rt.avg} size={12} /> {rt.avg.toFixed(1)} · {rt.n}</small>}</span>
                      </Link>
                    )}
                    <p>{r.message}</p>
                    <div className="or-facts">
                      {r.price > 0 && <em className="or-budget mono">{money(r.price)}</em>}
                      {r.days > 0 && <em>{r.days} дн.</em>}
                      <em>{ago(r.created_at)}</em>
                    </div>
                    <div className="or-own-actions">
                      {r.status === "accepted" && <span className="or-tag ok">✓ Исполнитель</span>}
                      {r.status === "declined" && <span className="or-tag">Отказ</span>}
                      {o.status === "open" && r.status === "sent" && (
                        <>
                          <button type="button" className="btn sm" onClick={() => accept(r)}>Выбрать исполнителем</button>
                          <button type="button" className="chip-btn" onClick={() => decline(r)}>Отклонить</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** Мои отклики как фрилансера */
export function MyResponses({ me }: { me: Profile }) {
  const [rows, setRows] = useState<Response[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("order_responses").select("*, order:orders(*)").eq("freelancer_id", me.id).order("created_at", { ascending: false });
    setRows((data as unknown as Response[]) ?? []);
  }, [me.id]);
  useEffect(() => { load(); }, [load]);
  useLive(["order_responses", "orders"], load);
  if (rows === null) return <div className="skeleton list-skeleton" />;
  if (!rows.length) return <div className="pf-empty"><p className="lead">Ты ещё не откликался на заказы. Загляни во вкладку «Заказы» — там есть подборка под твои ниши.</p></div>;
  return (
    <ul className="or-myresp">
      {rows.map((r) => (
        <li key={r.id} className={`st-${r.status}`}>
          <div><b>{r.order?.title ?? "Заказ удалён"}</b><small>{r.order ? `${budgetText(r.order)} · ` : ""}твоя цена {r.price ? money(r.price) : "—"}{r.days ? ` · ${r.days} дн.` : ""} · {ago(r.created_at)}</small></div>
          <span className={`or-status s-${r.status === "accepted" ? "in_work" : r.status === "declined" ? "closed" : "open"}`}>{r.status === "accepted" ? "🎉 Тебя выбрали" : r.status === "declined" ? "Выбрали другого" : "Ждёт ответа"}</span>
          {r.status === "sent" && <button type="button" className="chip-btn" onClick={async () => { await supabase.from("order_responses").delete().eq("id", r.id); load(); }}>Отозвать</button>}
          {r.status === "accepted" && <Link className="chip-btn" href="/messages/">Открыть чаты</Link>}
        </li>
      ))}
    </ul>
  );
}
