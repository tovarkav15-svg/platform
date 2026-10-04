"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { openDm } from "@/lib/api";
import { chatHref, profileHref } from "@/lib/links";
import { DEAL_SELECT, DEAL_STAGES, DEAL_STATUS, rub, type Deal, type DealEvent, type DealStep } from "@/lib/deals";
import { useLive } from "@/lib/live";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";

const EVENT: Record<string, string> = {
  created: "открыл сделку", proposed: "предложил условия", agreed: "согласился с условиями", started: "Условия согласованы — работа началась",
  step_done: "закрыл этап", step_undone: "вернул этап", delivered: "сдал работу", revise: "вернул на доработку", done: "принял работу — сделка закрыта", cancelled: "отменил сделку",
};
const dt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateText = (d: string | null) => (d ? new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "не указан");
type Draft = { price: string; deadline: string; terms: string; steps: { title: string; amount: string }[] };

export default function DealPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { ready, me } = useSession();
  const [deal, setDeal] = useState<Deal | null | "missing">(null);
  const [steps, setSteps] = useState<DealStep[]>([]);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState<{ kind: "deliver" | "revise" | "cancel"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ rating: number; text: string; saved: boolean }>({ rating: 0, text: "", saved: false });
  const [hover, setHover] = useState(0);

  const load = useCallback(async () => {
    const [{ data: d }, { data: s }, { data: e }] = await Promise.all([
      supabase.from("deals").select(DEAL_SELECT).eq("id", id).maybeSingle(),
      supabase.from("deal_steps").select("*").eq("deal_id", id).order("position"),
      supabase.from("deal_events").select("*").eq("deal_id", id).order("created_at"),
    ]);
    if (!d) return setDeal("missing");
    setDeal(d as unknown as Deal);
    setSteps((s as DealStep[]) ?? []);
    setEvents((e as DealEvent[]) ?? []);
    document.title = `Сделка · ${(d as unknown as Deal).order?.title ?? ""}`;
  }, [id]);
  useEffect(() => { if (ready && me) load(); }, [ready, me, load]);
  useLive(["deals", "deal_steps", "deal_events"], load, { enabled: !!me });

  // Мой отзыв по этой сделке, если уже оставлял
  useEffect(() => {
    if (!me || !deal || deal === "missing" || deal.status !== "done") return;
    supabase.from("reviews").select("rating, text").eq("author_id", me.id).eq("deal_id", deal.id).maybeSingle()
      .then(({ data }) => { if (data) setReview({ rating: data.rating, text: data.text, saved: true }); });
  }, [me, deal]);

  if (ready && !me) return <><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Войди, чтобы открыть сделку.</p><Link className="btn" href="/login">Войти</Link></div></main></>;
  if (deal === "missing") return <><TopBar /><main className="page"><div className="pf-empty"><p className="lead">Сделка не найдена или у тебя нет к ней доступа.</p><Link className="btn" href="/jobs/?tab=deals">Мои сделки</Link></div></main></>;
  if (!deal || !me) return <><TopBar /><main className="page"><div className="skeleton list-skeleton" /></main></>;

  const dealId = deal.id;
  const isClient = me.id === deal.client_id;
  const other = isClient ? deal.executor : deal.client;
  const myOk = isClient ? deal.client_ok : deal.executor_ok;
  const otherOk = isClient ? deal.executor_ok : deal.client_ok;
  const stage = DEAL_STAGES.findIndex((s) => s.id === deal.status);
  const doneSteps = steps.filter((s) => s.done).length;
  const stepsSum = steps.reduce((a, s) => a + s.amount, 0);
  const lastDelivery = [...events].reverse().find((e) => e.kind === "delivered");
  const lastRevise = [...events].reverse().find((e) => e.kind === "revise");
  const nameOf = (uid: string | null) => (uid === deal.client_id ? deal.client?.display_name : uid === deal.executor_id ? deal.executor?.display_name : null);

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { window.alert(error.message); return false; }
    await load();
    return true;
  }
  const startEdit = () => setDraft({
    price: deal.price ? String(deal.price) : "", deadline: deal.deadline ?? "", terms: deal.terms,
    steps: steps.length ? steps.map((s) => ({ title: s.title, amount: s.amount ? String(s.amount) : "" })) : [{ title: "", amount: "" }],
  });
  async function propose() {
    if (!draft) return;
    const ok = await run("deal_propose", {
      p_deal: dealId, p_price: Number(draft.price.replace(/\D/g, "")) || 0, p_deadline: draft.deadline || null, p_terms: draft.terms,
      p_steps: draft.steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), amount: Number(s.amount.replace(/\D/g, "")) || 0 })),
    });
    if (ok) setDraft(null);
  }
  async function submitNote() {
    if (!note) return;
    const fn = note.kind === "deliver" ? "deal_deliver" : note.kind === "revise" ? "deal_revise" : "deal_cancel";
    if (await run(fn, { p_deal: dealId, p_note: note.text })) setNote(null);
  }
  async function chat() {
    if (!other) return;
    try { router.push(chatHref(await openDm(other.id))); } catch { window.alert("Не получилось открыть чат"); }
  }

  return (
    <>
      <TopBar />
      <main className="page dl">
        <Link href="/jobs/?tab=deals" className="dl-back">← Мои сделки</Link>
        <header className="dl-head">
          <div>
            <span className="label">Сделка · {isClient ? "ты заказчик" : "ты исполнитель"}</span>
            <h1 className="h-lg">{deal.order?.title ?? "Заказ"}</h1>
          </div>
          <span className={`dl-st big st-${deal.status}`}>{DEAL_STATUS[deal.status]}</span>
        </header>

        {deal.status !== "cancelled" && (
          <ol className="dl-stages" aria-label="Этапы сделки">
            {DEAL_STAGES.map((s, i) => <li key={s.id} className={i < stage ? "past" : i === stage ? "now" : ""}><i>{i < stage || deal.status === "done" ? "✓" : i + 1}</i><span>{s.label}</span></li>)}
          </ol>
        )}

        <div className="dl-grid">
          <div className="dl-main">
            {/* ===== Что нужно сделать сейчас ===== */}
            {deal.status === "terms" && !draft && (
              <section className="dl-card dl-now">
                <b>{myOk ? (otherOk ? "Условия согласованы" : `Ждём, пока ${other?.display_name} подтвердит условия`) : otherOk ? `${other?.display_name} уже согласен с условиями — подтверди и начинайте` : "Договоритесь об условиях: цена, срок и этапы"}</b>
                <p>Работа начнётся, когда обе стороны нажмут «Согласен». Любая правка условий сбрасывает согласие второй стороны.</p>
                <div className="dl-oks">
                  <span className={deal.client_ok ? "ok" : ""}>{deal.client_ok ? "✓" : "…"} Заказчик</span>
                  <span className={deal.executor_ok ? "ok" : ""}>{deal.executor_ok ? "✓" : "…"} Исполнитель</span>
                </div>
                <div className="dl-actions">
                  {!myOk && <button type="button" className="btn" disabled={busy} onClick={() => run("deal_agree", { p_deal: deal.id })}>Согласен с условиями</button>}
                  <button type="button" className="btn ghost" onClick={startEdit}>Изменить условия</button>
                </div>
              </section>
            )}
            {deal.status === "active" && (
              <section className="dl-card dl-now">
                <b>{isClient ? `${other?.display_name} работает над заказом` : "Работа идёт — отмечай этапы и сдай работу, когда будет готово"}</b>
                {lastRevise && <p className="dl-quote"><small>Нужно поправить:</small>{lastRevise.note}</p>}
                {!isClient && <div className="dl-actions"><button type="button" className="btn" onClick={() => setNote({ kind: "deliver", text: "" })}>📦 Сдать работу</button></div>}
              </section>
            )}
            {deal.status === "review" && (
              <section className="dl-card dl-now">
                <b>{isClient ? "Работа сдана — проверь её" : `Работа на проверке у ${other?.display_name}`}</b>
                {lastDelivery?.note && <p className="dl-quote"><small>Комментарий исполнителя:</small>{lastDelivery.note}</p>}
                {isClient && (
                  <div className="dl-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => { if (window.confirm("Принять работу и закрыть сделку?")) run("deal_accept", { p_deal: deal.id }); }}>✓ Принять работу</button>
                    <button type="button" className="btn ghost" onClick={() => setNote({ kind: "revise", text: "" })}>На доработку</button>
                  </div>
                )}
              </section>
            )}
            {deal.status === "done" && (
              <section className="dl-card dl-now dl-done">
                <b>🎉 Сделка закрыта {deal.done_at ? dt(deal.done_at) : ""}</b>
                <p>{review.saved ? "Спасибо за отзыв! Его видно в профиле с пометкой «Сделка на Бирже»." : `Оцени ${isClient ? "работу" : "заказчика"} — отзыв появится в профиле ${other?.display_name} с пометкой «Сделка на Бирже».`}</p>
                <div className="rv-pick" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= (hover || review.rating) ? "on" : ""} onMouseEnter={() => setHover(n)} onClick={() => setReview({ ...review, rating: n, saved: false })} aria-label={`${n} из 5`}>★</button>)}
                </div>
                <textarea className="bl-in" rows={3} maxLength={800} value={review.text} onChange={(e) => setReview({ ...review, text: e.target.value, saved: false })} placeholder={isClient ? "Как прошла работа: сроки, качество, общение" : "Каково было работать с заказчиком: ТЗ, оплата, общение"} />
                <div className="dl-actions">
                  <button type="button" className="btn sm" disabled={!review.rating || busy || review.saved}
                    onClick={async () => { if (await run("deal_review", { p_deal: deal.id, p_rating: review.rating, p_text: review.text.trim() })) setReview({ ...review, saved: true }); }}>
                    {review.saved ? "✓ Отзыв сохранён" : "Оставить отзыв"}
                  </button>
                </div>
              </section>
            )}
            {deal.status === "cancelled" && (
              <section className="dl-card dl-now"><b>Сделка отменена</b><p>{isClient ? "Заказ снова открыт — можешь выбрать другого исполнителя во вкладке «Мои заказы»." : "Заказчик может выбрать другого исполнителя."}</p></section>
            )}

            {note && (
              <section className="dl-card">
                <b>{note.kind === "deliver" ? "Сдать работу" : note.kind === "revise" ? "Что нужно поправить?" : "Отменить сделку"}</b>
                <textarea className="bl-in" rows={4} maxLength={1500} autoFocus value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })}
                  placeholder={note.kind === "deliver" ? "Ссылка на результат и пара слов о том, что сделано" : note.kind === "revise" ? "Конкретно: что и где изменить" : "Причина (необязательно)"} />
                <div className="dl-actions">
                  <button type="button" className={`btn ${note.kind === "cancel" ? "danger" : ""}`} disabled={busy || (note.kind === "revise" && note.text.trim().length < 3)} onClick={submitNote}>
                    {note.kind === "deliver" ? "Сдать" : note.kind === "revise" ? "Вернуть на доработку" : "Отменить сделку"}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setNote(null)}>Назад</button>
                </div>
              </section>
            )}

            {/* ===== Условия ===== */}
            {draft ? (
              <section className="dl-card dl-edit">
                <b>Условия сделки</b>
                <div className="dl-two">
                  <label><span>Цена, ₽</span><input className="bl-in" inputMode="numeric" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d ]/g, "") })} placeholder="20 000" /></label>
                  <label><span>Срок сдачи</span><input className="bl-in" type="date" value={draft.deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
                </div>
                <label><span>Что входит в работу</span><textarea className="bl-in" rows={5} maxLength={3000} value={draft.terms} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} placeholder="Объём, формат результата, сколько правок включено, как передаётся результат" /></label>
                <span className="dl-sub">Этапы <small>— помогают видеть прогресс и платить частями</small></span>
                {draft.steps.map((s, i) => (
                  <div key={i} className="dl-step-edit">
                    <em className="mono">{i + 1}</em>
                    <input className="bl-in" value={s.title} maxLength={160} placeholder={i === 0 ? "Например: черновой вариант" : "Следующий этап"} onChange={(e) => { const st = [...draft.steps]; st[i] = { ...s, title: e.target.value }; setDraft({ ...draft, steps: st }); }} />
                    <input className="bl-in amt" inputMode="numeric" value={s.amount} placeholder="₽" onChange={(e) => { const st = [...draft.steps]; st[i] = { ...s, amount: e.target.value.replace(/[^\d]/g, "") }; setDraft({ ...draft, steps: st }); }} />
                    <button type="button" className="chip-btn" aria-label="Убрать этап" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, k) => k !== i) })}>✕</button>
                  </div>
                ))}
                {draft.steps.length < 20 && <button type="button" className="link-btn" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { title: "", amount: "" }] })}>+ Этап</button>}
                <div className="dl-actions">
                  <button type="button" className="btn" disabled={busy} onClick={propose}>Предложить условия</button>
                  <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Отмена</button>
                </div>
              </section>
            ) : (
              <section className="dl-card">
                <b>Условия</b>
                <dl className="dl-facts">
                  <div><dt>Цена</dt><dd className="mono">{deal.price ? rub(deal.price) : "не указана"}</dd></div>
                  <div><dt>Срок</dt><dd>{dateText(deal.deadline)}</dd></div>
                </dl>
                {deal.terms && <p className="dl-terms">{deal.terms}</p>}
                {steps.length > 0 && (
                  <>
                    <span className="dl-sub">Этапы · {doneSteps} из {steps.length}{stepsSum > 0 ? ` · ${rub(stepsSum)}` : ""}</span>
                    <div className="dl-progress"><i style={{ width: `${(doneSteps / steps.length) * 100}%` }} /></div>
                    <ul className="dl-steps">
                      {steps.map((s) => {
                        const canTick = !isClient && deal.status === "active";
                        return (
                          <li key={s.id} className={s.done ? "done" : ""}>
                            <button type="button" className="dl-tick" disabled={!canTick || busy} aria-label={s.done ? "Снять отметку" : "Этап готов"} onClick={() => run("deal_step_done", { p_step: s.id, p_done: !s.done })}>{s.done ? "✓" : ""}</button>
                            <span>{s.title}</span>
                            {s.amount > 0 && <em className="mono">{rub(s.amount)}</em>}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>

          <aside className="dl-side">
            {other && (
              <section className="dl-card dl-who">
                <span className="dl-sub">{isClient ? "Исполнитель" : "Заказчик"}</span>
                <Link href={profileHref(other.username)} className="dl-person">
                  <Avatar name={other.display_name} avatar={other.avatar} accent={other.accent} size={44} userId={other.id} />
                  <span><b>{other.display_name} <RoleBadge role={other.role} small /></b><small>@{other.username}{other.headline ? ` · ${other.headline}` : ""}</small></span>
                </Link>
                <button type="button" className="btn ghost sm" onClick={chat}>Написать в чат</button>
              </section>
            )}
            <section className="dl-card">
              <span className="dl-sub">История</span>
              <ol className="dl-log">
                {events.map((e) => (
                  <li key={e.id} className={`k-${e.kind}`}>
                    <i />
                    <span>{e.actor ? <b>{e.actor === me.id ? "Ты" : nameOf(e.actor)} </b> : null}{EVENT[e.kind] ?? e.kind}{e.note && (e.kind === "step_done" || e.kind === "step_undone") ? `: ${e.note}` : ""}</span>
                    <small>{dt(e.created_at)}</small>
                  </li>
                ))}
              </ol>
            </section>
            {(deal.status === "terms" || deal.status === "active") && !note && (
              <button type="button" className="link-btn dl-cancel" onClick={() => setNote({ kind: "cancel", text: "" })}>Отменить сделку</button>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
