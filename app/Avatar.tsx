"use client";

import { accentColor } from "@/lib/style";
import { usePresence } from "@/lib/presence";

type Props = { name: string; avatar?: string | null; accent?: string; size?: number; userId?: string | null };

export function Avatar({ name, avatar, accent = "edit", size = 40, userId }: Props) {
  const face = (
    <span
      className="ava"
      style={{ width: size, height: size, fontSize: size * 0.4, "--c": accentColor(accent) } as React.CSSProperties}
    >
      {avatar ? <img src={avatar} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
  if (!userId) return face;
  return (
    <span className="ava-wrap" style={{ "--s": `${size}px` } as React.CSSProperties}>
      {face}
      <PresenceDot userId={userId} size={size} />
    </span>
  );
}

/** Точка статуса в углу аватара: зелёная — в сети, жёлтый месяц — на платформе, серый месяц — спит */
export function PresenceDot({ userId, size = 40 }: { userId: string; size?: number }) {
  const p = usePresence(userId);
  if (!p) return null;
  const d = Math.max(10, Math.round(size * 0.3));
  return <span className={`pres pres-${p.state}`} style={{ width: d, height: d }} title={p.label} aria-label={p.label} role="img" />;
}

/** Подпись статуса: «В сети», «На платформе», «Спит · был в сети 2 ч назад» */
export function PresenceLabel({ userId }: { userId: string }) {
  const p = usePresence(userId);
  if (!p) return null;
  return <span className={`pres-label pres-${p.state}-t`}><i className={`pres pres-${p.state}`} />{p.label}</span>;
}
