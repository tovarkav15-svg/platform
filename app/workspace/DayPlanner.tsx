"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addDays, fromIso, iso, today, type PlanTask } from "@/lib/plans";
import { nextStage, type Project } from "@/lib/projects";

// ---------- Модель ----------
type Cat = "deep" | "client" | "learn" | "routine" | "rest" | "life";
type Block = { id: string; title: string; start: number; dur: number; cat: Cat; done: boolean; task_id?: string; project_id?: string; stage_id?: string };
type Big = { t: string; done: boolean };
type Plan = { blocks: Block[]; big3: Big[]; mood: number | null; note: string };
type Inbox = { key: string; title: string; sub: string; cat: Cat; dur: number; task_id?: string; project_id?: string; stage_id?: string; late?: boolean };

const CATS: { v: Cat; label: string; c: string }[] = [
  { v: "deep", label: "Глубокая работа", c: "#7B61FF" },
  { v: "client", label: "Клиенты и созвоны", c: "#2F7BFF" },
  { v: "learn", label: "Обучение", c: "#0EA5B7" },
  { v: "routine", label: "Рутина", c: "#8A8A87" },
  { v: "rest", label: "Здоровье и отдых", c: "#1FA67A" },
  { v: "life", label: "Личное", c: "#FF4F8B" },
];
const catOf = (v: Cat) => CATS.find((c) => c.v === v) ?? CATS[0];

const DAY_START = 6 * 60, DAY_END = 24 * 60, PX = 1.1, SNAP = 15;
const EMPTY: Plan = { blocks: [], big3: [], mood: null, note: "" };
const newId = () => crypto.randomUUID().slice(0, 8);
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const durLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}` : `${m} мин`);
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clampStart = (s: number, dur: number) => Math.max(DAY_START, Math.min(DAY_END - dur, s));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// Шаблон рабочего дня фрилансера
const TEMPLATE: Omit<Block, "id" | "done">[] = [
  { title: "Разобрать сообщения и почту", start: 9 * 60, dur: 30, cat: "routine" },
  { title: "Глубокая работа над главным проектом", start: 9 * 60 + 30, dur: 180, cat: "deep" },
  { title: "Обед без телефона", start: 12 * 60 + 30, dur: 60, cat: "rest" },
  { title: "Созвоны и переписка с клиентами", start: 13 * 60 + 30, dur: 90, cat: "client" },
  { title: "Правки и мелкие задачи", start: 15 * 60, dur: 90, cat: "deep" },
  { title: "Поиск новых клиентов", start: 16 * 60 + 30, dur: 60, cat: "client" },
  { title: "Урок или статья на Обучении", start: 17 * 60 + 30, dur: 45, cat: "learn" },
  { title: "Спорт или прогулка", start: 19 * 60, dur: 60, cat: "rest" },
];
const MOODS = ["Тяжело", "Так себе", "Нормально", "Хорошо", "Огонь"];

/** Короткий сигнал об окончании фокуса */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1318].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.start(t); o.stop(t + 0.55);
    });
  } catch {}
}

/** Раскладка пересекающихся блоков по дорожкам, чтобы они стояли рядом, а не друг на друге */
function lanes(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.dur - a.dur);
  const out = new Map<string, { lane: number; of: number }>();
  let group: Block[] = [], ends: number[] = [], groupEnd = -1;
  const flush = () => { const of = Math.max(1, ends.length); group.forEach((b) => (out.get(b.id)!.of = of)); group = []; ends = []; };
  for (const b of sorted) {
    if (b.start >= groupEnd) { flush(); groupEnd = -1; }
    let lane = ends.findIndex((e) => e <= b.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = b.start + b.dur;
    out.set(b.id, { lane, of: 1 });
    group.push(b);
    groupEnd = Math.max(groupEnd, b.start + b.dur);
  }
  flush();
  return out;
}

/** Ближайшее свободное время от «сейчас» (или от 9:00 для другого дня) */
function freeSlot(blocks: Block[], dur: number, from: number) {
  let s = Math.max(DAY_START, snap(from));
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (let guard = 0; guard < 200; guard++) {
    const hit = sorted.find((b) => s < b.start + b.dur && b.start < s + dur);
    if (!hit) return Math.min(s, DAY_END - dur);
    s = snap(hit.start + hit.dur + 7);
  }
  return s;
}

// ---------- Раздел ----------
export function DayPlanner({ userId }: { userId: string }) {
  const [day, setDay] = useState(today());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [inbox, setInbox] = useState<Inbox[]>([]);
  const [now, setNow] = useState(nowMin());
  const [edit, setEdit] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  const [toast, setToast] = useState("");
  const [cal, setCal] = useState(false);
  const [focus, setFocus] = useState<{ end: number; total: number } | null>(null);
  const [tick, setTick] = useState(Date.now());
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const isToday = day === today();
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2400); };

  // Загрузка дня, задач и этапов проектов
  const load = useCallback(async () => {
    setPlan(null);
    const [p, t, pr] = await Promise.all([
      supabase.from("day_plans").select("blocks, big3, mood, note").eq("user_id", userId).eq("day", day).maybeSingle(),
      supabase.from("plan_tasks").select("*").eq("user_id", userId).eq("done", false).lte("due_date", day).order("due_date"),
      supabase.from("ws_projects").select("*").eq("user_id", userId).in("status", ["active", "review", "idea"]),
    ]);
    setPlan(p.data ? { ...EMPTY, ...(p.data as Plan) } : EMPTY);
    const items: Inbox[] = [];
    for (const x of (t.data as PlanTask[]) ?? []) {
      items.push({ key: `t:${x.id}`, title: x.title, sub: x.due_date && x.due_date < day ? "Plans · просрочено" : x.due_time ? `Plans · ${x.due_time.slice(0, 5)}` : "Plans", cat: "deep", dur: 60, task_id: x.id, late: !!x.due_date && x.due_date < day });
    }
    for (const pj of ((pr.data as Project[]) ?? [])) {
      const st = nextStage({ tasks: Array.isArray(pj.tasks) ? pj.tasks : [] });
      if (st) items.push({ key: `p:${pj.id}:${st.id}`, title: st.t, sub: `Проект · ${pj.title}`, cat: "deep", dur: 90, project_id: pj.id, stage_id: st.id, late: !!st.due && st.due < day });
    }
    setInbox(items);
  }, [userId, day]);
  useEffect(() => { load(); }, [load]);

  // Часы и таймер фокуса
  useEffect(() => { const t = setInterval(() => { setNow(nowMin()); setTick(Date.now()); }, 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (focus && tick >= focus.end) { setFocus(null); flash("Фокус окончен. 5 минут перерыва"); chime(); } }, [tick, focus]);

  // Прокрутка к «сейчас» при открытии сегодняшнего дня
  useEffect(() => {
    if (!plan || !scroller.current) return;
    const target = isToday ? now - 90 : 8 * 60;
    scroller.current.scrollTop = Math.max(0, (target - DAY_START) * PX);
  }, [plan === null, day]);

  // Сохранение через полсекунды после правки
  function save(next: Plan) {
    setPlan(next);
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      const { error } = await supabase.from("day_plans").upsert({ user_id: userId, day, ...next, updated_at: new Date().toISOString() });
      if (error) flash("Не сохранилось. Проверь интернет.");
    }, 500);
  }
  const patchBlock = (id: string, ch: Partial<Block>) => plan && save({ ...plan, blocks: plan.blocks.map((b) => (b.id === id ? { ...b, ...ch } : b)) });

  // Отметка блока закрывает и задачу в Plans, и этап проекта
  async function toggleDone(b: Block) {
    if (!plan) return;
    const done = !b.done;
    patchBlock(b.id, { done });
    if (b.task_id) await supabase.from("plan_tasks").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", b.task_id);
    if (b.project_id && b.stage_id) {
      const { data } = await supabase.from("ws_projects").select("tasks").eq("id", b.project_id).maybeSingle();
      const tasks = ((data?.tasks as { id: string; done: boolean }[]) ?? []).map((s) => (s.id === b.stage_id ? { ...s, done } : s));
      await supabase.from("ws_projects").update({ tasks, updated_at: new Date().toISOString() }).eq("id", b.project_id);
    }
    if (done && (b.task_id || b.project_id)) flash(b.task_id ? "Задача закрыта и в Plans" : "Этап отмечен в проекте");
  }

  function schedule(it: Inbox, start?: number) {
    if (!plan) return;
    const s = start ?? freeSlot(plan.blocks, it.dur, isToday ? Math.max(now, 8 * 60) : 9 * 60);
    const b: Block = { id: newId(), title: it.title, start: clampStart(s, it.dur), dur: it.dur, cat: it.cat, done: false, task_id: it.task_id, project_id: it.project_id, stage_id: it.stage_id };
    save({ ...plan, blocks: [...plan.blocks, b] });
    // Время задачи видно и в Plans
    if (it.task_id) supabase.from("plan_tasks").update({ due_date: day, due_time: hm(b.start) }).eq("id", it.task_id).then(() => {});
    flash(`«${it.title}» в ${hm(b.start)}`);
  }

  function addAt(start: number, title = "", cat: Cat = "deep", dur = 60) {
    if (!plan) return;
    const b: Block = { id: newId(), title, start: clampStart(snap(start), dur), dur, cat, done: false };
    save({ ...plan, blocks: [...plan.blocks, b] });
    setEdit(b.id);
  }

  function useTemplate() {
    if (!plan) return;
    const taken = (b: Omit<Block, "id" | "done">) => plan.blocks.some((x) => x.start < b.start + b.dur && b.start < x.start + x.dur);
    const add = TEMPLATE.filter((b) => !taken(b)).map((b) => ({ ...b, id: newId(), done: false }));
    save({ ...plan, blocks: [...plan.blocks, ...add] });
    flash(add.length ? `Добавлено блоков: ${add.length}. Подвинь под себя` : "Время шаблона уже занято");
  }
  async function copyYesterday() {
    if (!plan) return;
    const { data } = await supabase.from("day_plans").select("blocks").eq("user_id", userId).eq("day", iso(addDays(fromIso(day), -1))).maybeSingle();
    const src = ((data?.blocks as Block[]) ?? []).filter((b) => !b.task_id && !b.project_id);
    if (!src.length) return flash("Вчера расписания не было");
    save({ ...plan, blocks: [...plan.blocks, ...src.map((b) => ({ ...b, id: newId(), done: false }))] });
    flash(`Скопировано блоков: ${src.length}`);
  }
  async function moveUndone() {
    if (!plan) return;
    const rest = plan.blocks.filter((b) => !b.done);
    if (!rest.length) return flash("Всё сделано, переносить нечего");
    const tomorrow = iso(addDays(fromIso(day), 1));
    const { data } = await supabase.from("day_plans").select("blocks, big3, mood, note").eq("user_id", userId).eq("day", tomorrow).maybeSingle();
    const next = { ...EMPTY, ...(data as Plan | null) };
    await supabase.from("day_plans").upsert({ user_id: userId, day: tomorrow, ...next, blocks: [...next.blocks, ...rest.map((b) => ({ ...b, id: newId() }))], updated_at: new Date().toISOString() });
    save({ ...plan, blocks: plan.blocks.filter((b) => b.done) });
    flash(`Перенесено на завтра: ${rest.length}`);
  }

  const scheduledKeys = useMemo(() => new Set((plan?.blocks ?? []).map((b) => (b.task_id ? `t:${b.task_id}` : b.project_id ? `p:${b.project_id}:${b.stage_id}` : ""))), [plan]);
  const freeInbox = inbox.filter((i) => !scheduledKeys.has(i.key));

  if (!plan) return <div className="skeleton profile-skeleton" />;

  const blocks = plan.blocks;
  const lay = lanes(blocks);
  const planned = blocks.reduce((a, b) => a + b.dur, 0);
  const doneMin = blocks.filter((b) => b.done).reduce((a, b) => a + b.dur, 0);
  const pct = planned ? Math.round((doneMin / planned) * 100) : 0;
  const current = isToday ? blocks.find((b) => now >= b.start && now < b.start + b.dur) : undefined;
  const upcoming = isToday ? [...blocks].filter((b) => b.start > now && !b.done).sort((a, b) => a.start - b.start)[0] : undefined;
  const byCat = CATS.map((c) => ({ ...c, m: blocks.filter((b) => b.cat === c.v).reduce((a, b) => a + b.dur, 0) })).filter((c) => c.m);
  const wakeWindow = Math.max(0, 16 * 60 - planned);
  const d = fromIso(day);
  const dayName = isToday ? "Сегодня" : day === iso(addDays(new Date(), 1)) ? "Завтра" : day === iso(addDays(new Date(), -1)) ? "Вчера" : d.toLocaleDateString("ru-RU", { weekday: "long" });
  const editing = edit ? blocks.find((b) => b.id === edit) : undefined;
  const focusLeft = focus ? Math.max(0, Math.round((focus.end - tick) / 1000)) : 0;

  return (
    <div className="dp">
      <header className="dp-head">
        <div className="dp-date">
          <button type="button" className="icon-btn" aria-label="Предыдущий день" onClick={() => setDay(iso(addDays(d, -1)))}>‹</button>
          <div className="dp-date-pick">
            <button type="button" className="dp-date-btn" onClick={() => setCal((v) => !v)} aria-expanded={cal} aria-label="Выбрать день в календаре">
              <span className="label">{dayName} ▾</span>
              <h1 className="dp-title">{d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</h1>
            </button>
            {cal && (
              <MonthPicker userId={userId} day={day} current={plan.blocks} onPick={(v) => { setDay(v); setCal(false); }} onClose={() => setCal(false)}
                onFilled={(n, first) => { flash(n ? `Расписано дней: ${n}${first ? `, с ${fromIso(first).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}` : "Свободных дней не нашлось: все уже расписаны"); setCal(false); }} />
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Следующий день" onClick={() => setDay(iso(addDays(d, 1)))}>›</button>
          {!isToday && <button type="button" className="dp-chip" onClick={() => setDay(today())}>К сегодня</button>}
        </div>
        <div className="dp-ring" style={{ "--p": pct } as React.CSSProperties} title={`Сделано ${durLabel(doneMin)} из ${durLabel(planned)}`}>
          <b>{pct}%</b><small>{planned ? `${durLabel(doneMin)} из ${durLabel(planned)}` : "день пуст"}</small>
        </div>
        <div className="dp-actions">
          <button type="button" className="btn ghost sm" onClick={useTemplate}>Шаблон дня</button>
          <button type="button" className="btn ghost sm" onClick={copyYesterday}>Повторить вчера</button>
          <button type="button" className="btn ghost sm" onClick={moveUndone}>Несделанное → завтра</button>
        </div>
      </header>

      <div className="dp-grid">
        {/* Шкала дня */}
        <section className="dp-timeline card">
          <div className="dp-scroll" ref={scroller}>
            <div className="dp-hours" style={{ height: (DAY_END - DAY_START) * PX }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("text/dayitem")) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const it = inbox.find((i) => i.key === e.dataTransfer.getData("text/dayitem"));
                const r = e.currentTarget.getBoundingClientRect();
                if (it) schedule(it, snap(DAY_START + (e.clientY - r.top) / PX - it.dur / 4));
              }}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const r = e.currentTarget.getBoundingClientRect();
                addAt(Math.floor((DAY_START + (e.clientY - r.top) / PX) / 30) * 30);
              }}>
              {Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => (
                <div key={i} className="dp-hour" style={{ top: i * 60 * PX, height: 60 * PX }}><span>{hm(DAY_START + i * 60)}</span></div>
              ))}
              {isToday && now >= DAY_START && <div className="dp-now" style={{ top: (now - DAY_START) * PX }}><span>{hm(now)}</span></div>}
              {blocks.map((b) => (
                <BlockView key={b.id} b={b} lane={lay.get(b.id)!} active={current?.id === b.id} past={isToday && b.start + b.dur <= now}
                  onMove={(start, dur) => patchBlock(b.id, { start, dur })} onOpen={() => setEdit(b.id)} onToggle={() => toggleDone(b)} />
              ))}
              {!blocks.length && (
                <div className="dp-empty" style={{ top: (9 * 60 - DAY_START) * PX }}>
                  <b>День пока пустой</b>
                  <span>Кликни по времени, чтобы добавить блок, перетащи задачу справа или возьми «Шаблон дня».</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="dp-side">
          {/* Сейчас */}
          {isToday && (
            <section className={`dp-nowcard ${current ? "on" : ""}`} style={{ "--c": current ? catOf(current.cat).c : "#8A8A87" } as React.CSSProperties}>
              <span className="label">Сейчас · {hm(now)}</span>
              {current ? (
                <>
                  <b className="dp-now-title">{current.title || "Без названия"}</b>
                  <div className="dp-now-bar"><i style={{ width: `${((now - current.start) / current.dur) * 100}%` }} /></div>
                  <small>осталось {durLabel(current.start + current.dur - now)} · {catOf(current.cat).label}</small>
                </>
              ) : <b className="dp-now-title">{upcoming ? "Свободное окно" : blocks.length ? "На сегодня всё" : "Ничего не запланировано"}</b>}
              {upcoming && <small className="dp-next">Дальше в {hm(upcoming.start)}: {upcoming.title || "блок"}</small>}
              <div className="dp-focus">
                {focus ? (
                  <><b className="mono">{String(Math.floor(focusLeft / 60)).padStart(2, "0")}:{String(focusLeft % 60).padStart(2, "0")}</b>
                    <div className="dp-focus-bar"><i style={{ width: `${(1 - focusLeft / focus.total) * 100}%` }} /></div>
                    <button type="button" className="btn ghost sm" onClick={() => setFocus(null)}>Стоп</button></>
                ) : (
                  <>{[25, 50].map((m) => <button key={m} type="button" className="btn sm" onClick={() => setFocus({ end: Date.now() + m * 60000, total: m * 60 })}>▶ Фокус {m} мин</button>)}</>
                )}
              </div>
            </section>
          )}

          {/* Главные 3 дела */}
          <section className="dp-card">
            <span className="label">Главные 3 дела</span>
            <ol className="dp-big3">
              {[0, 1, 2].map((i) => {
                const it = plan.big3[i] ?? { t: "", done: false };
                const set = (ch: Partial<Big>) => { const next = [0, 1, 2].map((j) => plan.big3[j] ?? { t: "", done: false }); next[i] = { ...it, ...ch }; save({ ...plan, big3: next }); };
                return (
                  <li key={i} className={it.done ? "done" : ""}>
                    <button type="button" className="chk" aria-pressed={it.done} aria-label="Сделано" disabled={!it.t.trim()} onClick={() => set({ done: !it.done })} />
                    <input value={it.t} maxLength={120} placeholder={["Самое важное сегодня", "Второе по важности", "Третье"][i]} aria-label={`Дело ${i + 1}`} onChange={(e) => set({ t: e.target.value })} />
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Не распланировано */}
          <section className="dp-card">
            <span className="label">Не распланировано · {freeInbox.length}</span>
            <form className="dp-quick" onSubmit={(e) => { e.preventDefault(); const t = quick.trim(); if (!t) return; schedule({ key: newId(), title: t.slice(0, 120), sub: "", cat: "deep", dur: 60 }); setQuick(""); }}>
              <div className="input"><input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Новое дело и Enter — встанет в свободное время" aria-label="Новое дело" /></div>
            </form>
            <ul className="dp-inbox">
              {freeInbox.map((it) => (
                <li key={it.key} draggable onDragStart={(e) => { e.dataTransfer.setData("text/dayitem", it.key); e.dataTransfer.effectAllowed = "copy"; }} className={it.late ? "late" : ""}>
                  <span className="dp-grip" aria-hidden="true">⋮⋮</span>
                  <span className="dp-in-text"><b>{it.title}</b><small>{it.sub}</small></span>
                  <button type="button" className="icon-btn sm" aria-label={`Поставить «${it.title}» в расписание`} title="В ближайшее свободное время" onClick={() => schedule(it)}>+</button>
                </li>
              ))}
              {!freeInbox.length && <li className="dp-in-empty">Задачи из Plans и этапы проектов на этот день появятся здесь</li>}
            </ul>
          </section>

          {/* Итог дня */}
          <section className="dp-card">
            <span className="label">Распределение дня</span>
            {byCat.length ? (
              <>
                <div className="dp-stack">{byCat.map((c) => <i key={c.v} style={{ flex: c.m, background: c.c }} title={`${c.label}: ${durLabel(c.m)}`} />)}</div>
                <ul className="dp-legend">{byCat.map((c) => <li key={c.v}><i style={{ background: c.c }} />{c.label}<b className="mono">{durLabel(c.m)}</b></li>)}</ul>
                <small className="hint">Запланировано {durLabel(planned)}. Свободно ещё около {durLabel(wakeWindow)} бодрствования.</small>
              </>
            ) : <small className="hint">Добавь блоки, и здесь будет видно, на что уходит день.</small>}
          </section>

          <section className="dp-card">
            <span className="label">Итоги дня</span>
            <div className="dp-moods" role="radiogroup" aria-label="Как прошёл день">
              {MOODS.map((m, i) => (
                <button key={m} type="button" role="radio" aria-checked={plan.mood === i + 1} className={plan.mood === i + 1 ? "on" : ""} style={{ "--m": i } as React.CSSProperties}
                  onClick={() => save({ ...plan, mood: plan.mood === i + 1 ? null : i + 1 })}><i />{m}</button>
              ))}
            </div>
            <textarea className="cd-input" rows={3} value={plan.note} maxLength={4000} placeholder="Что получилось, что мешало, что взять на завтра" aria-label="Итоги дня"
              onChange={(e) => save({ ...plan, note: e.target.value })} />
          </section>
        </aside>
      </div>

      {editing && (
        <BlockEditor b={editing} onClose={() => setEdit(null)}
          onPatch={(ch) => patchBlock(editing.id, ch)}
          onDelete={() => { save({ ...plan, blocks: plan.blocks.filter((x) => x.id !== editing.id) }); setEdit(null); }}
          onToggle={() => toggleDone(editing)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/** Блок на шкале: перетаскивание, растягивание за нижний край, клик открывает редактор */
function BlockView({ b, lane, active, past, onMove, onOpen, onToggle }: {
  b: Block; lane: { lane: number; of: number }; active: boolean; past: boolean;
  onMove: (start: number, dur: number) => void; onOpen: () => void; onToggle: () => void;
}) {
  const [drag, setDrag] = useState<{ start: number; dur: number } | null>(null);
  const cat = catOf(b.cat);
  const start = drag?.start ?? b.start, dur = drag?.dur ?? b.dur;
  const compact = dur < 45;

  function begin(e: React.PointerEvent, mode: "move" | "size") {
    if ((e.target as HTMLElement).closest(".dp-b-chk")) return;
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY; let moved = false;
    let cur = { start: b.start, dur: b.dur };
    const mv = (ev: PointerEvent) => {
      const dm = (ev.clientY - y0) / PX;
      if (Math.abs(ev.clientY - y0) > 4) moved = true;
      cur = mode === "move"
        ? { start: clampStart(snap(b.start + dm), b.dur), dur: b.dur }
        : { start: b.start, dur: Math.max(SNAP, Math.min(DAY_END - b.start, snap(b.dur + dm))) };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      setDrag(null);
      if (moved) onMove(cur.start, cur.dur); else if (mode === "move") onOpen();
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  return (
    <div className={`dp-block ${b.done ? "done" : ""} ${active ? "active" : ""} ${past && !b.done ? "past" : ""} ${drag ? "dragging" : ""} ${compact ? "compact" : ""}`}
      style={{ top: (start - DAY_START) * PX, height: Math.max(dur * PX - 3, 18), left: `calc(52px + (100% - 58px) * ${lane.lane / lane.of})`, width: `calc((100% - 58px) / ${lane.of} - 4px)`, "--c": cat.c } as React.CSSProperties}
      onPointerDown={(e) => begin(e, "move")} role="button" tabIndex={0} aria-label={`${b.title || "Блок"}, ${hm(start)}–${hm(start + dur)}`}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <button type="button" className="chk dp-b-chk" aria-pressed={b.done} aria-label={b.done ? "Вернуть" : "Сделано"} onPointerDown={(e) => e.stopPropagation()} onClick={onToggle} />
      <span className="dp-b-text">
        <b>{b.title || "Без названия"}</b>
        <small>{hm(start)}–{hm(start + dur)}{!compact && ` · ${durLabel(dur)}`}{b.task_id ? " · Plans" : b.project_id ? " · проект" : ""}</small>
      </span>
      <span className="dp-b-size" onPointerDown={(e) => begin(e, "size")} aria-hidden="true" />
    </div>
  );
}

function BlockEditor({ b, onClose, onPatch, onDelete, onToggle }: { b: Block; onClose: () => void; onPatch: (ch: Partial<Block>) => void; onDelete: () => void; onToggle: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const setTime = (v: string) => { const [h, m] = v.split(":").map(Number); if (!Number.isNaN(h)) onPatch({ start: clampStart(h * 60 + (m || 0), b.dur) }); };
  return (
    <div className="sheet-modal" role="dialog" aria-label="Блок дня" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-body card dp-editor" style={{ "--c": catOf(b.cat).c } as React.CSSProperties}>
        <input className="dp-ed-title" autoFocus value={b.title} maxLength={120} placeholder="Что делаешь в это время" aria-label="Название блока"
          onChange={(e) => onPatch({ title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") onClose(); }} />
        <div className="dp-ed-row">
          <label><span className="label">Начало</span><input type="time" className="cd-input" step={900} value={hm(b.start)} onChange={(e) => setTime(e.target.value)} /></label>
          <div><span className="label">Длительность</span>
            <div className="dp-durs">{[15, 30, 45, 60, 90, 120, 180].map((m) => <button key={m} type="button" className={b.dur === m ? "on" : ""} onClick={() => onPatch({ dur: m })}>{durLabel(m)}</button>)}</div>
          </div>
        </div>
        <div><span className="label">Тип</span>
          <div className="dp-cats">{CATS.map((c) => <button key={c.v} type="button" className={b.cat === c.v ? "on" : ""} style={{ "--c": c.c } as React.CSSProperties} onClick={() => onPatch({ cat: c.v })}><i />{c.label}</button>)}</div>
        </div>
        <div className="dp-ed-foot">
          <button type="button" className="btn ghost sm danger-text" onClick={onDelete}>Удалить</button>
          <button type="button" className="btn ghost sm" onClick={onToggle}>{b.done ? "Вернуть" : "Сделано"}</button>
          <button type="button" className="btn sm" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}

/** Календарь месяца: любой день вперёд и назад, отметки расписанных дней и заполнение месяца разом */
function MonthPicker({ userId, day, current, onPick, onClose, onFilled }: {
  userId: string; day: string; current: Block[]; onPick: (d: string) => void; onClose: () => void; onFilled: (n: number, first?: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(() => { const d = fromIso(day); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [marks, setMarks] = useState<Map<string, number>>(new Map());
  const existing = useRef<Map<string, Partial<Plan>>>(new Map());
  const [src, setSrc] = useState<"template" | "day">(current.length ? "day" : "template");
  const [which, setWhich] = useState<"weekdays" | "all">("weekdays");
  const [busy, setBusy] = useState(false);
  const td = today();
  const first = iso(month), last = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const loadMarks = useCallback(async () => {
    const { data } = await supabase.from("day_plans").select("day, blocks, big3, mood, note").eq("user_id", userId).gte("day", first).lte("day", last);
    const list = (data as ({ day: string } & Plan)[]) ?? [];
    existing.current = new Map(list.map((r) => [r.day, { big3: r.big3, mood: r.mood, note: r.note }]));
    setMarks(new Map(list.map((r) => [r.day, Array.isArray(r.blocks) ? r.blocks.length : 0])));
  }, [userId, first, last]);
  useEffect(() => { loadMarks(); }, [loadMarks]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);

  const start = addDays(month, -((month.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  // Дни месяца, которые будут заполнены: не раньше сегодня, только пустые, будни или все
  const targets = cells.filter((c) => c.getMonth() === month.getMonth()).map(iso)
    .filter((k) => k >= td && !(marks.get(k) ?? 0) && (which === "all" || ![0, 6].includes(fromIso(k).getDay())));
  const source = src === "day" && current.length ? current.filter((b) => !b.task_id && !b.project_id) : TEMPLATE.map((b) => ({ ...b, id: "", done: false }));

  async function fill() {
    if (!targets.length || !source.length) return onFilled(0);
    setBusy(true);
    // Главные дела, настроение и заметка уже записанного дня сохраняются
    const rows = targets.map((k) => ({
      user_id: userId, day: k, big3: [], mood: null, note: "", ...existing.current.get(k),
      blocks: source.map((b) => ({ ...b, id: newId(), done: false })), updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("day_plans").upsert(rows, { onConflict: "user_id,day" });
    setBusy(false);
    if (error) return onFilled(0);
    await loadMarks();
    onFilled(rows.length, targets[0]);
  }

  return (
    <div className="dp-cal card" ref={box} role="dialog" aria-label="Календарь">
      <div className="dp-cal-head">
        <button type="button" className="icon-btn sm" aria-label="Предыдущий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <b>{month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</b>
        <button type="button" className="icon-btn sm" aria-label="Следующий месяц" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="dp-cal-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => <span key={w} className="dp-cal-wd">{w}</span>)}
        {cells.map((c) => {
          const k = iso(c), n = marks.get(k) ?? 0;
          return (
            <button key={k} type="button" onClick={() => onPick(k)}
              className={`${c.getMonth() !== month.getMonth() ? "out" : ""} ${k === td ? "td" : ""} ${k === day ? "sel" : ""} ${targets.includes(k) ? "will" : ""}`}
              aria-label={`${c.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}${n ? `, блоков: ${n}` : ""}`}>
              {c.getDate()}{n > 0 && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="dp-fill">
        <span className="label">Заполнить {month.toLocaleDateString("ru-RU", { month: "long" })}</span>
        <div className="dp-seg">
          <button type="button" className={src === "template" ? "on" : ""} onClick={() => setSrc("template")}>Шаблоном дня</button>
          <button type="button" className={src === "day" ? "on" : ""} disabled={!current.length} onClick={() => setSrc("day")}>Как {fromIso(day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</button>
        </div>
        <div className="dp-seg">
          <button type="button" className={which === "weekdays" ? "on" : ""} onClick={() => setWhich("weekdays")}>Будни</button>
          <button type="button" className={which === "all" ? "on" : ""} onClick={() => setWhich("all")}>Все дни</button>
        </div>
        <button type="button" className="btn sm" disabled={busy || !targets.length} onClick={fill}>
          {busy ? "Заполняю…" : targets.length ? `Расписать ${targets.length} ${targets.length % 10 === 1 && targets.length % 100 !== 11 ? "день" : targets.length % 10 >= 2 && targets.length % 10 <= 4 && (targets.length % 100 < 10 || targets.length % 100 >= 20) ? "дня" : "дней"}` : "Пустых дней нет"}
        </button>
        <small className="hint">Заполняются только пустые дни начиная с сегодняшнего, они подсвечены. Уже расписанные не трогаются.</small>
      </div>
    </div>
  );
}
