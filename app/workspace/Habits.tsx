"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { addDays, iso, today } from "@/lib/plans";

type Habit = { id: string; title: string; emoji: string; color: string; per_week: number; archived: boolean; sort: number };
type Draft = { title: string; emoji: string; color: string; per_week: number };

const COLORS = ["#7B61FF", "#2F7BFF", "#0EA5B7", "#1FA67A", "#E8B100", "#FF6A3D", "#FF4F8B"];
const EMOJI = ["✨", "💧", "🏃", "📚", "🧘", "💤", "✍️", "🥗", "🚭", "💪", "🎯", "🧠", "📵", "🌅", "🎸", "💰"];
const IDEAS: Draft[] = [
  { title: "Пить 2 литра воды", emoji: "💧", color: "#0EA5B7", per_week: 7 },
  { title: "Спорт", emoji: "🏃", color: "#FF6A3D", per_week: 3 },
  { title: "Читать 20 минут", emoji: "📚", color: "#7B61FF", per_week: 7 },
  { title: "Пост в канал", emoji: "✍️", color: "#2F7BFF", per_week: 3 },
  { title: "Лечь до полуночи", emoji: "💤", color: "#1FA67A", per_week: 7 },
  { title: "Без телефона утром", emoji: "📵", color: "#FF4F8B", per_week: 5 },
];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY = 864e5;

const d0 = (s: string) => new Date(s + "T00:00:00");
const weekStart = (s: string) => { const d = d0(s); const w = (d.getDay() + 6) % 7; return iso(addDays(d, -w)); };
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};
const freqLabel = (n: number) => (n === 7 ? "каждый день" : `${n} ${plural(n, "раз", "раза", "раз")} в неделю`);

/** Серия: для ежедневных — дней подряд, для остальных — недель подряд с выполненной нормой */
function streakOf(h: Habit, done: Set<string>) {
  const td = today();
  if (h.per_week === 7) {
    let d = done.has(td) ? td : iso(addDays(d0(td), -1)), n = 0;
    while (done.has(d)) { n++; d = iso(addDays(d0(d), -1)); }
    return { n, unit: plural(n, "день", "дня", "дней") };
  }
  const inWeek = (ws: string) => Array.from({ length: 7 }, (_, i) => iso(addDays(d0(ws), i))).filter((x) => done.has(x)).length;
  let ws = weekStart(td), n = 0;
  if (inWeek(ws) >= h.per_week) n++;
  ws = iso(addDays(d0(ws), -7));
  while (inWeek(ws) >= h.per_week) { n++; ws = iso(addDays(d0(ws), -7)); }
  return { n, unit: plural(n, "неделя", "недели", "недель") };
}

function bestStreak(done: Set<string>) {
  const days = [...done].sort();
  let best = 0, cur = 0, prev = "";
  for (const d of days) { cur = prev && d0(d).getTime() - d0(prev).getTime() === DAY ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}

/** Привычки: отметка за сегодня в одно касание, неделя, серия, тепловая карта за 12 недель */
export function Habits({ userId }: { userId: string }) {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [checks, setChecks] = useState<Map<string, Set<string>>>(new Map());
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState("");
  const td = today();

  const load = useCallback(async () => {
    const since = iso(addDays(new Date(), -400));
    const [h, c] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", userId).order("sort").order("created_at"),
      supabase.from("habit_checks").select("habit_id, day").eq("user_id", userId).gte("day", since),
    ]);
    if (h.error) { setErr("Раздел ещё запускается — загляни чуть позже."); setHabits([]); return; }
    setHabits((h.data as Habit[]) ?? []);
    const m = new Map<string, Set<string>>();
    ((c.data as { habit_id: string; day: string }[]) ?? []).forEach((x) => { if (!m.has(x.habit_id)) m.set(x.habit_id, new Set()); m.get(x.habit_id)!.add(x.day); });
    setChecks(m);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  async function toggle(h: Habit, day: string) {
    if (day > td) return;
    const set = new Set(checks.get(h.id) ?? []);
    const on = !set.has(day);
    if (on) set.add(day); else set.delete(day);
    setChecks(new Map(checks).set(h.id, set));
    if (on && day === td && "vibrate" in navigator) navigator.vibrate?.(12);
    const r = on
      ? await supabase.from("habit_checks").insert({ habit_id: h.id, user_id: userId, day })
      : await supabase.from("habit_checks").delete().eq("habit_id", h.id).eq("day", day);
    if (r.error && !/duplicate/.test(r.error.message)) load();
  }

  async function create(d: Draft) {
    const { data, error } = await supabase.from("habits").insert({ ...d, title: d.title.trim(), user_id: userId, sort: (habits?.length ?? 0) }).select("*").single();
    if (error || !data) { setErr("Не получилось сохранить. Попробуй ещё раз."); return false; }
    setHabits([...(habits ?? []), data as Habit]);
    setAdding(false);
    return true;
  }
  async function update(h: Habit, d: Partial<Habit>) {
    setHabits((habits ?? []).map((x) => (x.id === h.id ? { ...x, ...d } : x)));
    await supabase.from("habits").update(d).eq("id", h.id);
  }
  async function remove(h: Habit) {
    setHabits((habits ?? []).filter((x) => x.id !== h.id));
    setOpen(null);
    await supabase.from("habits").delete().eq("id", h.id);
  }

  const active = useMemo(() => (habits ?? []).filter((h) => !h.archived), [habits]);
  const archived = (habits ?? []).filter((h) => h.archived);
  if (!habits) return <div className="skeleton profile-skeleton" />;

  const ws = weekStart(td);
  const week = Array.from({ length: 7 }, (_, i) => iso(addDays(d0(ws), i)));
  // На сегодня — ежедневные и те, у кого норма недели ещё не набрана
  const dueToday = active.filter((h) => h.per_week === 7 || week.filter((d) => checks.get(h.id)?.has(d)).length < h.per_week || checks.get(h.id)?.has(td));
  const doneToday = dueToday.filter((h) => checks.get(h.id)?.has(td)).length;
  const pct = dueToday.length ? doneToday / dueToday.length : 0;

  return (
    <div className="ws-section hb">
      <section className="hb-head">
        <div className="hb-ring" style={{ "--p": pct } as React.CSSProperties}>
          <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" className="hb-ring-bg" /><circle cx="22" cy="22" r="18" className="hb-ring-fg" /></svg>
          <b>{doneToday}/{dueToday.length}</b>
        </div>
        <div className="hb-head-t">
          <small>{d0(td).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}</small>
          <h2>{!active.length ? "Привычки" : pct === 1 ? "Всё на сегодня сделано 🎉" : doneToday ? `Сделано ${doneToday} из ${dueToday.length}` : "Отметь, что сделал сегодня"}</h2>
          <p>{active.length ? "Нажми на кружок — привычка отмечена. Пропустил вчера? Отметь день в строке недели." : "Маленькие дела каждый день — большие результаты. Начни с одной-двух привычек."}</p>
        </div>
        {active.length > 0 && !adding && <button type="button" className="btn" onClick={() => setAdding(true)}>+ Привычка</button>}
      </section>

      {err && <p className="hint bad">{err}</p>}

      {(adding || !active.length) && (
        <HabitForm onSave={create} onCancel={active.length ? () => setAdding(false) : undefined} ideas={!active.length || adding} />
      )}

      <ul className="hb-list">
        {active.map((h) => {
          const done = checks.get(h.id) ?? new Set<string>();
          const st = streakOf(h, done);
          const wk = week.filter((d) => done.has(d)).length;
          const isOn = done.has(td);
          return (
            <li key={h.id} className={`hb-item ${isOn ? "on" : ""} ${open === h.id ? "open" : ""}`} style={{ "--c": h.color } as React.CSSProperties}>
              <div className="hb-row">
                <button type="button" className="hb-check" onClick={() => toggle(h, td)} aria-pressed={isOn} aria-label={isOn ? `Снять отметку: ${h.title}` : `Отметить: ${h.title}`}>
                  <span>{isOn ? "✓" : h.emoji}</span>
                </button>
                <button type="button" className="hb-title" onClick={() => setOpen(open === h.id ? null : h.id)} aria-expanded={open === h.id}>
                  <b>{h.title}</b>
                  <small>
                    {st.n > 0 ? <span className="hb-fire">🔥 {st.n} {st.unit} подряд</span> : <span>{freqLabel(h.per_week)}</span>}
                    {h.per_week < 7 && <span> · {wk} из {h.per_week} на неделе</span>}
                  </small>
                </button>
                <div className="hb-week" role="group" aria-label="Эта неделя">
                  {week.map((d, i) => (
                    <button key={d} type="button" className={`hb-day ${done.has(d) ? "on" : ""} ${d === td ? "today" : ""}`} disabled={d > td}
                      onClick={() => toggle(h, d)} aria-label={`${WD[i]}${done.has(d) ? ", сделано" : ""}`} title={d0(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}>
                      <small>{WD[i]}</small><i />
                    </button>
                  ))}
                </div>
              </div>
              {open === h.id && <HabitDetails h={h} done={done} onToggle={(d) => toggle(h, d)} onUpdate={(d) => update(h, d)} onRemove={() => remove(h)} />}
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <section className="hb-arch">
          <button type="button" className="link-btn" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Скрыть архив" : `Архив (${archived.length})`}</button>
          {showArchived && (
            <ul>
              {archived.map((h) => (
                <li key={h.id}><span>{h.emoji} {h.title}</span><button type="button" className="btn ghost sm" onClick={() => update(h, { archived: false })}>Вернуть</button><button type="button" className="btn ghost sm danger-text" onClick={() => remove(h)}>Удалить</button></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function HabitForm({ onSave, onCancel, ideas, initial }: { onSave: (d: Draft) => Promise<boolean> | void; onCancel?: () => void; ideas?: boolean; initial?: Draft }) {
  const [d, setD] = useState<Draft>(initial ?? { title: "", emoji: "✨", color: COLORS[0], per_week: 7 });
  const [pending, setPending] = useState(false);
  return (
    <form className="hb-form" style={{ "--c": d.color } as React.CSSProperties} onSubmit={async (e) => {
      e.preventDefault();
      if (!d.title.trim()) return;
      setPending(true); await onSave(d); setPending(false);
    }}>
      {ideas && !initial && (
        <div className="hb-ideas">
          <small>Идеи — нажми, чтобы подставить</small>
          <div>{IDEAS.map((x) => <button key={x.title} type="button" className="fn-cat" onClick={() => setD(x)}><i>{x.emoji}</i>{x.title}</button>)}</div>
        </div>
      )}
      <div className="hb-form-main">
        <span className="hb-form-emoji">{d.emoji}</span>
        <div className="input grow"><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={60} placeholder="Например: зарядка 10 минут" aria-label="Название привычки" autoFocus={!ideas} /></div>
        <select className="mini-select" value={d.per_week} onChange={(e) => setD({ ...d, per_week: Number(e.target.value) })} aria-label="Как часто">
          {[7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{freqLabel(n)}</option>)}
        </select>
      </div>
      <div className="hb-pick">
        <div className="hb-emojis">{EMOJI.map((x) => <button key={x} type="button" className={d.emoji === x ? "on" : ""} onClick={() => setD({ ...d, emoji: x })}>{x}</button>)}</div>
        <div className="hb-colors">{COLORS.map((c) => <button key={c} type="button" className={d.color === c ? "on" : ""} style={{ background: c }} onClick={() => setD({ ...d, color: c })} aria-label="Цвет" />)}</div>
      </div>
      <div className="save-row">
        <button className="btn" type="submit" disabled={pending || !d.title.trim()}>{initial ? "Сохранить" : "Добавить привычку"}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Отмена</button>}
      </div>
    </form>
  );
}

function HabitDetails({ h, done, onToggle, onUpdate, onRemove }: { h: Habit; done: Set<string>; onToggle: (d: string) => void; onUpdate: (d: Partial<Habit>) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(false);
  const [ask, setAsk] = useState(false);
  const td = today();
  // 12 недель: колонки — недели, строки — дни недели
  const start = iso(addDays(d0(weekStart(td)), -7 * 11));
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, i) => iso(addDays(d0(start), w * 7 + i))));
  const last30 = Array.from({ length: 30 }, (_, i) => iso(addDays(d0(td), -i)));
  const rate = Math.round((last30.filter((d) => done.has(d)).length / (30 * h.per_week / 7)) * 100);

  if (edit) return <div className="hb-details"><HabitForm initial={h} onSave={(d) => { onUpdate(d); setEdit(false); }} onCancel={() => setEdit(false)} /></div>;
  return (
    <div className="hb-details">
      <div className="hb-heat" role="group" aria-label="Последние 12 недель">
        <div className="hb-heat-wd">{WD.map((w, i) => <small key={w}>{i % 2 === 0 ? w : ""}</small>)}</div>
        {weeks.map((wk) => (
          <div key={wk[0]} className="hb-heat-col">
            {wk.map((d) => <button key={d} type="button" className={`${done.has(d) ? "on" : ""} ${d === td ? "today" : ""}`} disabled={d > td} onClick={() => onToggle(d)} title={d0(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} aria-label={d} />)}
          </div>
        ))}
      </div>
      <div className="hb-stats">
        <span><b>{bestStreak(done)}</b><small>лучшая серия, дней</small></span>
        <span><b>{done.size}</b><small>всего отметок</small></span>
        <span><b>{Math.min(100, rate)}%</b><small>выполнение за 30 дней</small></span>
      </div>
      <div className="save-row">
        <button type="button" className="btn ghost sm" onClick={() => setEdit(true)}>Изменить</button>
        <button type="button" className="btn ghost sm" onClick={() => onUpdate({ archived: true })}>В архив</button>
        {ask
          ? <><button type="button" className="btn ghost sm danger-text" onClick={onRemove}>Да, удалить с историей</button><button type="button" className="btn ghost sm" onClick={() => setAsk(false)}>Отмена</button></>
          : <button type="button" className="btn ghost sm danger-text" onClick={() => setAsk(true)}>Удалить</button>}
      </div>
    </div>
  );
}
