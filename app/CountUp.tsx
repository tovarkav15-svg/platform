"use client";

import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Плавно докручивает число до нового значения (и при первом показе — от нуля) */
export function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);

  useEffect(() => {
    if (reduced()) { setShown(value); from.current = value; return; }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3); // ease-out
      const v = a + (b - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return shown;
}

export function CountUp({ value, format = (n) => String(Math.round(n)), ms }: { value: number; format?: (n: number) => string; ms?: number }) {
  const v = useCountUp(value, ms);
  return <>{format(v)}</>;
}
