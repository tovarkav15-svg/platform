"use client";

import { useState } from "react";
import { rub } from "@/lib/workspace";

// Цвета серий проверены валидатором палитры: доход и расход различимы и при дальтонизме
export const INCOME = "#2F7BFF";
export const EXPENSE = "#FF6A3D";

const niceMax = (v: number) => {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const short = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн` : v >= 1e3 ? `${Math.round(v / 1e3)} тыс` : String(v);

type Month = { key: string; label: string; income: number; expense: number };

/** Доход и расход по месяцам: сгруппированные столбцы, одна ось, подсказка при наведении */
export function MonthBars({ data, active, onPick }: { data: Month[]; active: string; onPick: (key: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, L = 48, R = 8, T = 12, B = 28;
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expense)), 0));
  const band = (W - L - R) / data.length;
  const bw = Math.min(24, (band - 18) / 2);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * max);
  const bar = (x: number, v: number, color: string) => {
    const top = y(v), h = H - B - top;
    if (h <= 0) return null;
    const r = Math.min(4, h);
    return <path d={`M${x},${H - B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - B} Z`} fill={color} />;
  };

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span><i style={{ background: INCOME }} />Доход</span>
        <span><i style={{ background: EXPENSE }} />Расход</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Доход и расход по месяцам">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">{short(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = L + i * band + (band - bw * 2 - 2) / 2;
          return (
            <g key={d.key} style={{ "--i": i } as React.CSSProperties} className={`mgroup ${d.key === active ? "active" : ""} ${hover !== null && hover !== i ? "dim" : ""}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick(d.key)}>
              <rect x={L + i * band} y={T} width={band} height={H - T - B + 20} fill="transparent" />
              {bar(x0, d.income, INCOME)}
              {bar(x0 + bw + 2, d.expense, EXPENSE)}
              <text x={L + i * band + band / 2} y={H - 8} textAnchor="middle" className={`tick ${d.key === active ? "strong" : ""}`}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((L + hover * band + band / 2) / W) * 100}%` }}>
          <b>{data[hover].label}</b>
          <span><i style={{ background: INCOME }} />Доход {rub(data[hover].income)}</span>
          <span><i style={{ background: EXPENSE }} />Расход {rub(data[hover].expense)}</span>
          <span className="tip-total">Итог {rub(data[hover].income - data[hover].expense, true)}</span>
        </div>
      )}
    </div>
  );
}

/** Горизонтальные столбцы одной серии: расходы по категориям или доход по клиентам */
export function HBars({ rows, color, empty }: { rows: { label: string; value: number }[]; color: string; empty: string }) {
  if (!rows.length) return <p className="lead small">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label} style={{ "--i": rows.indexOf(r) } as React.CSSProperties} title={`${r.label}: ${rub(r.value)}`}>
          <span className="hb-label">{r.label}</span>
          <span className="hb-track"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} /></span>
          <span className="hb-value">{rub(r.value)}<em>{Math.round((r.value / total) * 100)}%</em></span>
        </li>
      ))}
    </ul>
  );
}
