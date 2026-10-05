"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/live";

type StreakData = {
  frozen: string[];
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

/** Данные серии: грузятся сами и обновляются, когда закрыли задачу */
function useStreakData(onChange?: (prev: StreakData, next: StreakData) => void) {
  const [s, setS] = useState<StreakData | null>(null);
  const prev = useRef<StreakData | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_streak");
    if (!data) return;
    const raw = data as StreakData;
    const next = { ...raw, frozen: raw.frozen ?? [] };
    if (prev.current) cb.current?.(prev.current, next);
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
  return s;
}

type Cell = "on" | "frz" | "today" | "future" | "miss";
function cellOf(s: StreakData, d: string, done: Set<string>): Cell {
  if (done.has(d)) return "on";
  if (s.frozen.includes(d)) return "frz";
  return d === s.today ? "today" : d > s.today ? "future" : "miss";
}
const CELL_TITLE: Record<Cell, string> = { on: "Задачи закрыты", frz: "Выходной — серия сохранена", today: "Сегодня", future: "", miss: "Пропуск" };

function Week({ s, big = false, pop = false }: { s: StreakData; big?: boolean; pop?: boolean }) {
  const done = new Set(s.days.map((d) => d.day));
  return (
    <ol className={`sk-week ${big ? "big" : ""}`} aria-label="Эта неделя">
      {weekOf(s.today).map((d, i) => {
        const c = cellOf(s, d, done);
        return (
          <li key={d} className={`${c} ${pop && d === s.today ? "pop" : ""}`} style={{ "--i": i } as React.CSSProperties} title={CELL_TITLE[c]}>
            <span>{WD[i]}</span>
            <i>{c === "on" ? <Flame size={big ? 18 : 14} /> : c === "frz" ? <em className="sk-ice">❄</em> : null}</i>
          </li>
        );
      })}
    </ol>
  );
}

/** Карточка серии в Plans */
export function StreakCard() {
  const s = useStreakData();
  const [how, setHow] = useState(false);
  if (!s) return <div className="sk sk-ph skeleton" />;
  const lit = s.today_done;
  const prevMs = s.next ? [0, 3, 7, 14, 30, 60, 100, 365].filter((m) => m < s.next!.milestone).pop() ?? 0 : 0;
  const pct = s.next ? Math.min(1, (s.current - prevMs) / (s.next.milestone - prevMs)) : 1;
  const status = lit
    ? s.current > 1 ? "Серия продлена. Возвращайся завтра — огонь ждёт." : "Огонь зажжён! Закрой задачу и завтра."
    : s.current > 0 ? `Закрой задачу сегодня, чтобы продлить серию. Пропуск съест выходной ❄, а без них серия сгорит.` : "Закрой первую задачу — и огонь загорится.";

  return (
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
          <button type="button" className="sk-how-btn" aria-expanded={how} onClick={() => setHow(!how)} title="Как считается серия">?</button>
        </div>
        {how ? (
          <ul className="sk-how">
            <li>🔥 День засчитан, если закрыл хотя бы одну задачу (сутки по Москве).</li>
            <li>❄ Два выходных в неделю: пропуск не обрывает серию, но и не добавляет день.</li>
            <li>⏱ Задачи, созданные меньше 3 минут назад, не считаются — честная серия.</li>
            <li>🪙 За 3, 7, 14, 30, 60, 100 и 365 дней — Coins в AURA Shop.</li>
          </ul>
        ) : (
          <>
            <p className="sk-status">{status}</p>
            <Week s={s} />
            {s.next && (
              <div className="sk-next">
                <div className="sk-bar"><i style={{ width: `${pct * 100}%` }} /></div>
                <small>До {s.next.milestone} {daysWord(s.next.milestone)} — ещё {s.next.milestone - s.current} · <b>+{s.next.coins} Coins</b></small>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Огонёк в шапке, как в Duolingo: число дней на любой странице. Здесь же живёт праздник «N дней подряд!» */
export function StreakChip() {
  const [party, setParty] = useState<{ s: StreakData; from: number; coins: number; milestone: number } | null>(null);
  const s = useStreakData((p, next) => {
    if (!p.today_done && next.today_done) {
      const fresh = next.rewards.filter((r) => !p.rewards.some((x) => x.milestone === r.milestone));
      setParty({ s: next, from: p.current, coins: fresh.reduce((a, r) => a + r.coins, 0), milestone: fresh[fresh.length - 1]?.milestone ?? 0 });
    }
  });
  if (!s) return null;
  const risk = !s.today_done && s.current > 0;
  return (
    <>
      <Link href="/workspace/?tab=plans" className={`sk-chip ${s.today_done ? "lit" : "out"} ${risk ? "risk" : ""}`}
        title={s.today_done ? `Серия ${s.current} ${daysWord(s.current)} — сегодня засчитан` : risk ? `Серия ${s.current} ${daysWord(s.current)} — закрой задачу сегодня` : "Закрой задачу, чтобы зажечь огонь"}>
        <Flame size={16} lit={s.today_done} />
        <b className="mono">{s.current}</b>
      </Link>
      {party && <StreakParty from={party.from} to={party.s.current} coins={party.coins} milestone={party.milestone} s={party.s} onClose={() => setParty(null)} />}
    </>
  );
}

function StreakParty({ from, to, coins, milestone, s, onClose }: {
  from: number; to: number; coins: number; milestone: number; s: StreakData; onClose: () => void;
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
        <Week s={s} big pop />
        {coins > 0 && <div className="skp-reward">+{coins} Coins <small>за серию {milestone} {daysWord(milestone)}</small></div>}
        <button type="button" className="btn skp-go" autoFocus onClick={onClose}>Продолжить</button>
      </div>
    </div>,
    document.body,
  );
}
