"use client";

import { useEffect, useState } from "react";
import { NICHES } from "@/lib/niches";
import { Avatar } from "./Avatar";

type Person = { id: string; display_name: string; avatar: string | null; accent: string };

/** Шапка раздела: у каждого пространства своя картинка и настроение */
export function SpaceHero({ space, eyebrow, title, text, art, aside }: {
  space: "discover" | "people" | "community" | "goals" | "workspace";
  eyebrow: string; title: React.ReactNode; text?: string; art?: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className={`space-hero sh-${space}`}>
      <div className="sh-text">
        <div className="label">{eyebrow}</div>
        <h1 className="h-xl caps">{title}</h1>
        {text && <p className="lead">{text}</p>}
        {aside}
      </div>
      {art && <div className="sh-art" aria-hidden="true">{art}</div>}
    </section>
  );
}

/** Discover: бегущая строка ниш */
export function NicheMarquee() {
  const row = [...NICHES, ...NICHES];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {row.map((n, i) => (
          <span key={i} style={{ "--c": n.color } as React.CSSProperties}><i />{n.title}</span>
        ))}
      </div>
      <div className="marquee-track reverse">
        {[...row].reverse().map((n, i) => (
          <span key={i} className="it" style={{ "--c": n.color } as React.CSSProperties}>{n.title.toLowerCase()}</span>
        ))}
      </div>
    </div>
  );
}

/** People: парящие аватары */
export function FloatingFaces({ people, total }: { people: Person[]; total: number }) {
  const spots = [[8, 18, 64], [34, 4, 48], [58, 22, 72], [80, 6, 44], [18, 62, 50], [48, 64, 40], [74, 58, 58]];
  return (
    <div className="faces">
      {spots.map(([x, y, s], i) => {
        const p = people[i];
        return (
          <span key={i} className="face" style={{ left: `${x}%`, top: `${y}%`, "--d": `${i * 0.7}s` } as React.CSSProperties}>
            {p ? <Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={s} /> : <span className="face-empty" style={{ width: s, height: s }} />}
          </span>
        );
      })}
      <span className="faces-count"><b>{total}</b><em className="it">на платформе</em></span>
    </div>
  );
}

/** Community: друзья на орбите вокруг тебя */
export function Orbit({ me, friends }: { me: Person; friends: Person[] }) {
  const ring = friends.slice(0, 8);
  return (
    <div className="orbit">
      <span className="orbit-ring r1" />
      <span className="orbit-ring r2" />
      <div className="orbit-spin">
        {ring.map((f, i) => {
          const a = (i / Math.max(ring.length, 1)) * Math.PI * 2;
          return (
            <span key={f.id} className="orbit-item" style={{ left: `${(50 + 42 * Math.cos(a)).toFixed(2)}%`, top: `${(50 + 42 * Math.sin(a)).toFixed(2)}%` }}>
              <Avatar name={f.display_name} avatar={f.avatar} accent={f.accent} size={40} />
            </span>
          );
        })}
      </div>
      <span className="orbit-me"><Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={68} /></span>
    </div>
  );
}

/** Цели: горная линия, которая прорисовывается */
export function Mountain() {
  return (
    <svg viewBox="0 0 320 160" className="mountain">
      <path className="m-back" d="M0 150 L60 92 L96 118 L150 46 L196 102 L236 70 L320 150 Z" />
      <path className="m-line" d="M0 150 L60 92 L96 118 L150 46 L196 102 L236 70 L320 150" />
      <path className="m-route" d="M20 140 L60 98 L96 122 L150 52" />
      <g className="m-flag"><line x1="150" y1="46" x2="150" y2="20" /><path d="M150 20 L172 27 L150 34 Z" /></g>
      <circle className="m-dot" cx="96" cy="122" r="5" />
    </svg>
  );
}

/** Workspace: живые часы и дата */
export function StudioClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="studio-clock" />;
  const hh = String(now.getHours()).padStart(2, "0"), mm = String(now.getMinutes()).padStart(2, "0"), ss = String(now.getSeconds()).padStart(2, "0");
  return (
    <div className="studio-clock">
      <span className="mono big">{hh}<i className="blink">:</i>{mm}<small>{ss}</small></span>
      <span className="studio-date">{now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}</span>
      <span className="studio-week mono">W{weekNo(now)} · день {dayOfYear(now)}</span>
    </div>
  );
}

function weekNo(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
function dayOfYear(d: Date) {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}
