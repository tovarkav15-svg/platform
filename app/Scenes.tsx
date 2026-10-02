// Живые сцены для верхнего баннера (AURA Shop). Нарисованы с нуля в SVG, анимации — в CSS (.sc-*)

const pines = (y: number, n: number, h: number, seed: number, fill: string) =>
  Array.from({ length: n }, (_, i) => {
    const x = (i / n) * 1240 - 20 + ((i * seed) % 37);
    const hh = h * (0.7 + ((i * 13 + seed) % 10) / 22);
    return <path key={i} d={`M${x} ${y} l${hh * 0.32} 0 l-${hh * 0.16} -${hh} z`} fill={fill} />;
  });

function Ship({ x, y, s = 1, sail = "#E9E1D2", stripe = "#B7412E" }: { x: number; y: number; s?: number; sail?: string; stripe?: string }) {
  return (
    <g className="sc-ship" transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="sc-rock">
        <path d="M-70 0 Q-60 18 0 20 Q60 18 72 0 Q78 -10 84 -22 Q80 -14 70 -8 L-62 -8 Q-74 -12 -80 -24 Q-78 -10 -70 0 Z" fill="#2B2A33" />
        <path d="M84 -22 q6 -6 4 -14 q-4 4 -8 4" fill="#2B2A33" />
        <rect x="-2" y="-78" width="4" height="72" fill="#2B2A33" />
        <path d="M-34 -72 L34 -72 Q38 -40 34 -14 L-34 -14 Q-38 -40 -34 -72 Z" fill={sail} />
        {[-24, -8, 8, 24].map((sx, i) => <rect key={i} x={sx - 4} y="-72" width="8" height="58" fill={stripe} opacity=".85" />)}
        {[-50, -34, -18, -2, 14, 30, 46].map((cx) => <circle key={cx} cx={cx} cy="-4" r="5" fill="#C9A15A" stroke="#2B2A33" strokeWidth="1.5" />)}
      </g>
    </g>
  );
}

export function SceneFx({ id }: { id?: string | null }) {
  if (!id) return null;
  return (
    <div className={`fx-scene ${id}`} aria-hidden="true">
      <svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice">
        {id === "s-winter" && <Winter />}
        {id === "s-field" && <Field />}
        {id === "s-fjord" && <Fjord />}
        {id === "s-sea" && <Sea />}
        {id === "s-aurora" && <Aurora />}
      </svg>
      {(id === "s-winter" || id === "s-fjord") && <span className="sc-snow">{Array.from({ length: 24 }, (_, i) => <i key={i} />)}</span>}
      {id === "s-aurora" && <span className="sc-stars">{Array.from({ length: 24 }, (_, i) => <i key={i} />)}</span>}
    </div>
  );
}

function Winter() {
  return (
    <>
      <defs><linearGradient id="wSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BFD3EA" /><stop offset="1" stopColor="#F4F7FB" /></linearGradient></defs>
      <rect width="1200" height="300" fill="url(#wSky)" />
      <circle className="sc-glow" cx="940" cy="80" r="34" fill="#FFFDF4" />
      <path d="M0 210 L140 120 L260 190 L420 100 L560 180 L720 110 L880 190 L1040 120 L1200 200 L1200 300 L0 300Z" fill="#D9E3EF" />
      <g className="sc-drift-slow">{pines(250, 26, 90, 7, "#8FA6BF")}</g>
      <path d="M0 250 Q300 230 600 250 T1200 245 L1200 300 L0 300Z" fill="#fff" />
      <g>{pines(300, 18, 150, 3, "#5D7690")}</g>
    </>
  );
}

function Field() {
  return (
    <>
      <defs>
        <linearGradient id="fSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB98A" /><stop offset=".55" stopColor="#FFE1B8" /><stop offset="1" stopColor="#FFF4DD" /></linearGradient>
        <linearGradient id="fGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E8B861" /><stop offset="1" stopColor="#C98E3A" /></linearGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#fSky)" />
      <circle className="sc-sun" cx="820" cy="170" r="54" fill="#FFF3C4" />
      <path d="M0 190 Q200 160 420 185 T860 175 T1200 185 L1200 300 L0 300Z" fill="#B9A06C" opacity=".6" />
      <path d="M0 215 Q300 195 620 212 T1200 205 L1200 300 L0 300Z" fill="url(#fGround)" />
      <g className="sc-wheat">
        {Array.from({ length: 70 }, (_, i) => {
          const x = i * 17 + (i % 3) * 4;
          const h = 46 + ((i * 7) % 22);
          return <path key={i} className="sc-stalk" style={{ animationDelay: `${-(i % 9) * 0.3}s` }} d={`M${x} 300 Q${x + 3} ${300 - h / 2} ${x + 6} ${300 - h}`} stroke="#A9702A" strokeWidth="2" fill="none" />;
        })}
      </g>
      <g className="sc-birds">
        {[[0, 0], [30, 12], [56, -6], [80, 16]].map(([dx, dy], i) => <path key={i} d={`M${dx} ${dy} q8 -8 16 0 q8 -8 16 0`} stroke="#6B4A2B" strokeWidth="2.4" fill="none" />)}
      </g>
    </>
  );
}

function Fjord() {
  return (
    <>
      <defs>
        <linearGradient id="jSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F3C6B8" /><stop offset=".6" stopColor="#F8E3D4" /><stop offset="1" stopColor="#EEF1F4" /></linearGradient>
        <linearGradient id="jSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8EA8BC" /><stop offset="1" stopColor="#5E7A92" /></linearGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#jSky)" />
      <path d="M0 190 L80 70 L150 120 L220 40 L330 190Z" fill="#6E7F92" />
      <path d="M220 40 L250 62 L236 70 L208 58Z" fill="#fff" />
      <path d="M860 190 L960 60 L1040 110 L1110 30 L1200 90 L1200 190Z" fill="#6E7F92" />
      <path d="M1110 30 L1140 52 L1120 60 L1094 50Z M960 60 L986 82 L950 84Z" fill="#fff" />
      <path d="M300 190 L420 120 L520 170 L620 130 L760 190Z" fill="#9AA9B8" opacity=".7" />
      <rect y="190" width="1200" height="110" fill="url(#jSea)" />
      <g className="sc-waves">
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M-100 ${205 + i * 14} q 40 -6 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0`} stroke="#fff" strokeOpacity={0.35 - i * 0.03} strokeWidth="2" fill="none" />)}
      </g>
      <Ship x={560} y={226} s={0.9} />
    </>
  );
}

function Sea() {
  return (
    <>
      <defs>
        <linearGradient id="sSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B4C6B" /><stop offset=".55" stopColor="#C77B5A" /><stop offset="1" stopColor="#F2C79A" /></linearGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#sSky)" />
      <g className="sc-clouds" opacity=".55">
        <ellipse cx="200" cy="70" rx="160" ry="26" fill="#5A6784" />
        <ellipse cx="640" cy="50" rx="220" ry="30" fill="#55617C" />
        <ellipse cx="1050" cy="80" rx="180" ry="24" fill="#5A6784" />
      </g>
      <circle cx="300" cy="200" r="40" fill="#FFD7A3" opacity=".8" />
      <path className="sc-swell3" d="M-200 215 Q-100 195 0 215 T200 215 T400 215 T600 215 T800 215 T1000 215 T1200 215 T1400 215 L1400 300 L-200 300Z" fill="#41506A" />
      <Ship x={640} y={228} s={1.05} sail="#D9CDB8" stripe="#7E2B22" />
      <path className="sc-swell2" d="M-200 240 Q-120 222 -40 240 T120 240 T280 240 T440 240 T600 240 T760 240 T920 240 T1080 240 T1240 240 T1400 240 L1400 300 L-200 300Z" fill="#33405A" />
      <path className="sc-swell1" d="M-200 266 Q-130 250 -60 266 T80 266 T220 266 T360 266 T500 266 T640 266 T780 266 T920 266 T1060 266 T1200 266 T1340 266 L1400 300 L-200 300Z" fill="#26304A" />
      <g className="sc-birds gulls">
        {[[0, 0], [40, 14], [70, -10]].map(([dx, dy], i) => <path key={i} d={`M${dx} ${dy} q10 -9 20 0 q10 -9 20 0`} stroke="#F5EDE2" strokeWidth="2.4" fill="none" />)}
      </g>
    </>
  );
}

function Aurora() {
  return (
    <>
      <defs>
        <linearGradient id="aSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E1530" /><stop offset="1" stopColor="#1E2B4E" /></linearGradient>
        <linearGradient id="aBand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5BF0B5" stopOpacity="0" /><stop offset=".3" stopColor="#5BF0B5" /><stop offset=".7" stopColor="#8C7BFF" /><stop offset="1" stopColor="#8C7BFF" stopOpacity="0" /></linearGradient>
        <filter id="aBlur"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <rect width="1200" height="300" fill="url(#aSky)" />
      <g filter="url(#aBlur)" className="sc-aurora">
        <path className="sc-band1" d="M-50 120 Q200 40 450 110 T950 90 T1300 110" stroke="url(#aBand)" strokeWidth="46" fill="none" opacity=".75" />
        <path className="sc-band2" d="M-50 160 Q300 80 600 150 T1300 130" stroke="url(#aBand)" strokeWidth="30" fill="none" opacity=".5" />
      </g>
      <path d="M0 230 L120 170 L210 210 L330 140 L470 220 L600 160 L760 225 L900 150 L1040 215 L1200 170 L1200 300 L0 300Z" fill="#141B33" />
      <rect y="250" width="1200" height="50" fill="#18223F" />
      <path className="sc-reflect" d="M200 262 H520 M640 272 H980 M120 284 H400" stroke="#5BF0B5" strokeOpacity=".25" strokeWidth="2" />
    </>
  );
}

/** Анимация поверх любого баннера: частицы и туман снизу */
export function OverlayFx({ id }: { id?: string | null }) {
  if (!id) return null;
  return <span className={`fx-over ${id}`} aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</span>;
}
