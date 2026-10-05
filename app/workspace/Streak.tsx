"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/live";

type StreakData = {
  current: number; best: number; today_done: boolean; today: string;
  days: { day: string; n: number }[];
  next: { milestone: number; coins: number } | null;
  rewards: { milestone: number; coins: number; at: string }[];
};

export const daysWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней");
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

/** Неделя с понедельника, в которую входит «сегодня» по Москве */
function weekOf(today: string) {
  const t = new Date(`${today}T00:00:00Z`);
  const mon = new Date(t);
  mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i); return isoDay(d); });
}

/** Огонь из трёх языков пламени: каждый колышется в своём ритме */
export function Flame({ size = 64, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <svg className={`flame ${lit ? "lit" : "out"}`} viewBox="0 0 64 80" width={size} height={size * 1.25} aria-hidden="true">
      <defs>
        <linearGradient id="flOuter" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FF4D1C" /><stop offset=".6" stopColor="#FF7A1A" /><stop offset="1" stopColor="#FFB020" /></linearGradient>
        <linearGradient id="flMid" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#FF9A1F" /><stop offset="1" stopColor="#FFD24A" /></linearGradient>
        <radialGradient id="flCore" cx=".5" cy=".75" r=".6"><stop offset="0" stopColor="#FFFDF2" /><stop offset="1" stopColor="#FFE58A" /></radialGradient>
      </defs>
      <path className="fl-o" d="M32 4 C38 18 54 28 54 50 C54 66 44 76 32 76 C20 76 10 66 10 50 C10 38 18 30 22 22 C24 32 28 36 31 36 C28 26 28 14 32 4 Z" fill="url(#flOuter)" />
      <path className="fl-m" d="M33 28 C37 38 46 44 46 56 C46 66 40 72 32 72 C24 72 18 66 18 57 C18 50 22 46 25 42 C26 48 29 51 31 51 C30 44 30 36 33 28 Z" fill="url(#flMid)" />
      <path className="fl-c" d="M32 48 C35 54 39 57 39 63 C39 68 36 71 32 71 C28 71 25 68 25 63 C25 59 28 56 30 53 Z" fill="url(#flCore)" />
    </svg>
  );
}

/** Карточка серии в Plans + праздник, когда день засчитан */
export function StreakCard() {
  const [s, setS] = useState<StreakData | null>(null);
  const [party, setParty] = useState<{ from: number; to: number; coins: number; milestone: number } | null>(null);
  const prev = useRef<StreakData | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_streak");
    if (!data) return;
    const next = data as StreakData;
    const p = prev.current;
    // Первая закрытая задача за день — показываем праздник, как в Duolingo
    if (p && !p.today_done && next.today_done) {
      const fresh = next.rewards.filter((r) => !p.rewards.some((x) => x.milestone === r.milestone));
      const top = fresh[fresh.length - 1];
      setParty({ from: p.current, to: next.current, coins: fresh.reduce((a, r) => a + r.coins, 0), milestone: top?.milestone ?? 0 });
    }
    prev.current = next;
    setS(next);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["plan_streak_days"], load, { poll: 60000 });
  useEffect(() => {
    const on = () => setTimeout(load, 350);
    window.addEventListener("plans:done", on);
    return () => window.removeEventListener("plans:done", on);
  }, [load]);

  if (!s) return <div className="sk sk-ph skeleton" />;
  const done = new Set(s.days.map((d) => d.day));
  const week = weekOf(s.today);
  const lit = s.today_done;
  const prevMs = s.next ? [0, 3, 7, 14, 30, 60, 100, 365].filter((m) => m < s.next!.milestone).pop() ?? 0 : 0;
  const pct = s.next ? Math.min(1, (s.current - prevMs) / (s.next.milestone - prevMs)) : 1;
  const status = lit
    ? s.current > 1 ? "Серия продлена. Возвращайся завтра — огонь ждёт." : "Огонь зажжён! Закрой задачу и завтра."
    : s.current > 0 ? `Закрой хотя бы одну задачу сегодня, чтобы не потерять ${s.current} ${daysWord(s.current)}.` : "Закрой первую задачу — и огонь загорится.";

  return (
    <>
      <section className={`sk ${lit ? "hot" : "cold"} ${!lit && s.current > 0 ? "risk" : ""}`} aria-label={`Серия: ${s.current} ${daysWord(s.current)} подряд`}>
        <div className="sk-flame">
          <span className="sk-glow" aria-hidden="true" />
          <Flame size={58} lit={lit} />
        </div>
        <div className="sk-main">
          <div className="sk-count">
            <b key={s.current} className="mono">{s.current}</b>
            <span>{daysWord(s.current)} подряд</span>
            {s.best > 0 && <small className="sk-best">рекорд {s.best}</small>}
          </div>
          <p className="sk-status">{status}</p>
          <ol className="sk-week" aria-label="Эта неделя">
            {week.map((d, i) => {
              const cls = done.has(d) ? "on" : d === s.today ? "today" : d > s.today ? "future" : "miss";
              return (
                <li key={d} className={cls} style={{ "--i": i } as React.CSSProperties} title={cls === "on" ? "Задачи закрыты" : cls === "miss" ? "Пропуск" : ""}>
                  <span>{WD[i]}</span>
                  <i>{cls === "on" ? <Flame size={14} /> : null}</i>
                </li>
              );
            })}
          </ol>
          {s.next && (
            <div className="sk-next">
              <div className="sk-bar"><i style={{ width: `${pct * 100}%` }} /></div>
              <small>До {s.next.milestone} {daysWord(s.next.milestone)} — ещё {s.next.milestone - s.current} · <b>+{s.next.coins} Coins</b></small>
            </div>
          )}
        </div>
      </section>
      {party && <StreakParty {...party} week={week} done={done} today={s.today} onClose={() => setParty(null)} />}
    </>
  );
}

function StreakParty({ from, to, coins, milestone, week, done, today, onClose }: {
  from: number; to: number; coins: number; milestone: number; week: string[]; done: Set<string>; today: string; onClose: () => void;
}) {
  const [n, setN] = useState(from);
  useEffect(() => {
    const t = setTimeout(() => setN(to), 650);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") onClose(); };
    window.addEventListener("keydown", k);
    return () => { clearTimeout(t); window.removeEventListener("keydown", k); };
  }, [to, onClose]);
  // Через портал в body: у родителей карточки есть анимации с transform, они «запирают» fixed внутри себя
  return createPortal(
    <div className="skp" role="dialog" aria-modal="true" aria-label={`${to} ${daysWord(to)} подряд`} onClick={onClose}>
      <div className="skp-card" onClick={(e) => e.stopPropagation()}>
        <div className="skp-fire">
          <span className="skp-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--d": `${(i % 4) * 40}ms` } as React.CSSProperties} />)}</span>
          <Flame size={130} />
        </div>
        <div className="skp-num">
          <b key={n} className="mono">{n}</b>
        </div>
        <h2>{daysWord(to)} подряд!</h2>
        <p>{to === 1 ? "Огонь зажжён. Закрывай хотя бы одну задачу каждый день, чтобы он не погас." : milestone ? `Отметка ${milestone} ${daysWord(milestone)} — так держать!` : "Серия продлена. Увидимся завтра!"}</p>
        <ol className="sk-week big">
          {week.map((d, i) => (
            <li key={d} className={d === today ? "on pop" : done.has(d) ? "on" : d > today ? "future" : "miss"} style={{ "--i": i } as React.CSSProperties}>
              <span>{WD[i]}</span><i>{done.has(d) || d === today ? <Flame size={18} /> : null}</i>
            </li>
          ))}
        </ol>
        {coins > 0 && <div className="skp-reward">+{coins} Coins <small>за серию {milestone} {daysWord(milestone)}</small></div>}
        <button type="button" className="btn skp-go" autoFocus onClick={onClose}>Продолжить</button>
      </div>
    </div>,
    document.body,
  );
}
