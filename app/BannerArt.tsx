// Нижние баннеры AURA Shop со своей графикой (SVG + CSS-анимации .ba-*). Простые частицы остались в .fx-banner i
const R = (n: number) => Array.from({ length: n }, (_, i) => i);

export function BannerArt({ id }: { id: string }) {
  switch (id) {
    case "b-equalizer":
      return <div className="ba-eq">{R(42).map((i) => <span key={i} style={{ "--i": i, "--d": `${0.55 + ((i * 37) % 9) / 12}s` } as React.CSSProperties} />)}</div>;

    case "b-heartbeat":
      return (
        <svg className="ba-ecg" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true">
          <path className="ba-ecg-line" d="M0 50 H90 l10 -6 l10 6 H150 l8 10 l12 -48 l12 60 l10 -22 H260 l10 -6 l10 6 H330 l8 10 l12 -48 l12 60 l10 -22 H430 l10 -6 l10 6 H500 l8 10 l12 -48 l12 60 l10 -22 H600" />
        </svg>
      );

    case "b-terminal":
      return (
        <div className="ba-term">
          <div className="ba-term-bar"><i /><i /><i /><b>relic — zsh</b></div>
          {["> relic init profile", "✓ портфолио собрано", "> npm run ship", "✓ задеплоено за 0.8s"].map((t, i) => (
            <p key={i} style={{ "--n": t.length, "--i": i } as React.CSSProperties}><span>{t}</span></p>
          ))}
        </div>
      );

    case "b-planes":
      return (
        <div className="ba-planes">
          {R(3).map((i) => (
            <span key={i} className="ba-plane" style={{ "--i": i } as React.CSSProperties}>
              <svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 11 L22 3 L15 21 L11 13 Z" fill="#fff" stroke="#7B61FF" strokeWidth="1.4" strokeLinejoin="round" /><path d="M11 13 L22 3" stroke="#7B61FF" strokeWidth="1.2" /></svg>
            </span>
          ))}
        </div>
      );

    case "b-iso":
      return (
        <div className="ba-iso">
          {R(7).map((i) => (
            <svg key={i} viewBox="0 0 40 46" style={{ "--i": i } as React.CSSProperties}>
              <path d="M20 2 L38 12 L20 22 L2 12 Z" fill="#C9BCFF" />
              <path d="M2 12 L20 22 L20 44 L2 34 Z" fill="#9C86F5" />
              <path d="M38 12 L20 22 L20 44 L38 34 Z" fill="#7B61FF" />
            </svg>
          ))}
        </div>
      );

    case "b-kinetic":
      return (
        <div className="ba-kin">
          <p><span>CREATE • BUILD • SHIP • GROW • CREATE • BUILD • SHIP • GROW • </span><span>CREATE • BUILD • SHIP • GROW • CREATE • BUILD • SHIP • GROW • </span></p>
          <p className="rev"><span>ДЕЛАЙ • ПОКАЗЫВАЙ • ЗАРАБАТЫВАЙ • ДЕЛАЙ • ПОКАЗЫВАЙ • ЗАРАБАТЫВАЙ • </span><span>ДЕЛАЙ • ПОКАЗЫВАЙ • ЗАРАБАТЫВАЙ • ДЕЛАЙ • ПОКАЗЫВАЙ • ЗАРАБАТЫВАЙ • </span></p>
        </div>
      );

    case "b-city": {
      const b = [[0, 60, 40], [44, 90, 34], [82, 50, 46], [132, 120, 30], [166, 75, 52], [222, 100, 38], [264, 55, 44], [312, 135, 34], [350, 80, 48], [402, 110, 36], [442, 65, 50], [496, 95, 40], [540, 125, 32], [576, 70, 46]];
      return (
        <svg className="ba-city" viewBox="0 0 620 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <defs><linearGradient id="baCity" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B2F6B" /><stop offset="1" stopColor="#1E1A33" /></linearGradient></defs>
          {b.map(([x, h, w], i) => (
            <g key={i}>
              <rect x={x} y={140 - h} width={w} height={h} fill="url(#baCity)" />
              {R(Math.floor(h / 16)).map((r) => R(Math.floor(w / 12)).map((c) => (
                <rect key={`${r}-${c}`} className="ba-win" x={x + 4 + c * 12} y={140 - h + 6 + r * 16} width="5" height="7" fill="#FFD27A"
                  style={{ "--d": `${2 + ((i * 7 + r * 3 + c * 5) % 9)}s`, "--o": ((i + r + c) % 3) / 3 } as React.CSSProperties} />
              )))}
            </g>
          ))}
        </svg>
      );
    }

    case "b-neon":
      return (
        <svg className="ba-neon" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
          <path className="n1" d="M-10 90 C 80 40, 160 120, 250 70 S 420 20, 610 80" />
          <path className="n2" d="M-10 105 C 120 70, 200 130, 320 95 S 500 60, 610 100" />
          <path className="n3" d="M-10 70 C 60 100, 180 30, 300 60 S 480 110, 610 55" />
        </svg>
      );

    case "b-vinyl":
      return (
        <div className="ba-vinyl">
          <span className="ba-disc"><i /></span>
          <span className="ba-arm" />
          {R(4).map((i) => <em key={i} className="ba-note" style={{ "--i": i } as React.CSSProperties}>{["♪", "♫", "♬", "♩"][i]}</em>)}
        </div>
      );

    case "b-koi":
      return (
        <div className="ba-koi">
          {R(3).map((i) => <span key={i} className="ba-ripple" style={{ "--i": i } as React.CSSProperties} />)}
          {R(3).map((i) => (
            <span key={i} className="ba-fish" style={{ "--i": i } as React.CSSProperties}>
              <svg viewBox="0 0 60 24" width="60" height="24">
                <path d="M4 12 C 14 2, 34 2, 44 12 C 34 22, 14 22, 4 12 Z" fill={i === 1 ? "#FFF6EC" : "#FF8A4C"} />
                <path d="M44 12 L58 4 L54 12 L58 20 Z" fill={i === 1 ? "#FFB27A" : "#FF6A3D"} className="ba-tail" />
                <circle cx="12" cy="10" r="1.6" fill="#1E1A33" />
                {i !== 1 && <path d="M20 6 C 26 10, 26 14, 22 18" stroke="#FFF6EC" strokeWidth="3" fill="none" />}
              </svg>
            </span>
          ))}
        </div>
      );

    case "b-lava":
      return (
        <svg className="ba-lava" viewBox="0 0 600 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <defs>
            <filter id="baGoo"><feGaussianBlur stdDeviation="10" /><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" /></filter>
            <linearGradient id="baLava" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF4F8B" /><stop offset="1" stopColor="#FFB547" /></linearGradient>
          </defs>
          <g filter="url(#baGoo)" fill="url(#baLava)">
            <rect x="0" y="140" width="600" height="40" />
            {R(9).map((i) => <circle key={i} className="ba-blob" cx={30 + i * 66} cy="150" r={14 + (i % 3) * 7} style={{ "--i": i } as React.CSSProperties} />)}
          </g>
        </svg>
      );

    case "b-glitch":
      return (
        <div className="ba-glitch">
          {R(6).map((i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}
          <span className="ba-scan" />
        </div>
      );

    case "b-fireworks":
      return (
        <div className="ba-fw">
          {R(4).map((b) => (
            <span key={b} className="ba-burst" style={{ "--b": b } as React.CSSProperties}>
              {R(14).map((i) => <i key={i} style={{ "--a": `${i * (360 / 14)}deg` } as React.CSSProperties} />)}
            </span>
          ))}
        </div>
      );

    case "b-planets":
      return (
        <div className="ba-sys">
          <span className="ba-sun" />
          {R(4).map((i) => <span key={i} className="ba-orbit" style={{ "--i": i } as React.CSSProperties}><i /></span>)}
        </div>
      );
  }
  return null;
}
