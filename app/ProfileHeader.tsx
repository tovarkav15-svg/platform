"use client";

import { useRef } from "react";
import { accentColor } from "@/lib/style";
import { isOwner } from "@/lib/supabase";

type Props = {
  displayName: string;
  username: string;
  headline?: string;
  bio?: string;
  status?: string;
  openToWork?: boolean;
  accent: string;
  avatar?: string | null;
  role?: string;
  banner?: string | null;      // ссылка на свою картинку
  bannerPreset?: string;       // готовый градиент, если своей картинки нет
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
};

export function RoleBadge({ role, small }: { role?: string; small?: boolean }) {
  if (!isOwner(role)) return null;
  return <span className={`badge owner ${small ? "sm" : ""}`}>Owner</span>;
}

export function Banner({ image, preset = "aurora", className = "" }: { image?: string | null; preset?: string; className?: string }) {
  return (
    <div className={`ph2-banner bn-${image ? "image" : preset} ${className}`}>
      {image ? <img src={image} alt="" /> : <><i className="bn-l1" /><i className="bn-l2" /><i className="bn-l3" /></>}
    </div>
  );
}

/**
 * Карточка-удостоверение: баннер, квадратный аватар, имя.
 * Главная плитка профиля и живое превью в настройках.
 */
export function ProfileHeader({ displayName, username, headline, bio, status, openToWork, accent, avatar, role, banner, bannerPreset, meta, actions, compact }: Props) {
  const ref = useRef<HTMLElement>(null);

  // Аватар чуть поворачивается за курсором
  const tilt = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--tx", `${(((e.clientX - r.left) / r.width) - 0.5) * 14}deg`);
    el.style.setProperty("--ty", `${(((e.clientY - r.top) / r.height) - 0.5) * -14}deg`);
  };

  return (
    <section ref={ref} className={`idt ${compact ? "compact" : ""}`} style={{ "--c": accentColor(accent) } as React.CSSProperties}
      onPointerMove={tilt} onPointerLeave={() => { ref.current?.style.setProperty("--tx", "0deg"); ref.current?.style.setProperty("--ty", "0deg"); }}>
      <Banner image={banner} preset={bannerPreset} className="idt-banner" />
      <div className="idt-body">
        <div className={`idt-avatar ${openToWork ? "otw-on" : ""}`}>
          <div className="avatar">
            {avatar ? <img src={avatar} alt="" /> : (displayName || username || "?").slice(0, 1).toUpperCase()}
          </div>
          {openToWork && <span className="idt-otw"><i />Открыт к работе</span>}
        </div>
        <div className="idt-id">
          <span className="idt-serial mono">ID · @{username || "username"}</span>
          <div className="idt-name">
            <h1 className="caps">{displayName || "Имя"}</h1>
            <RoleBadge role={role} />
          </div>
          {headline && <span className="idt-headline">{headline}</span>}
          {status && <span className="status-line"><i />{status}</span>}
        </div>
      </div>
      {bio && <p className="idt-bio it">«{bio}»</p>}
      {(meta || actions) && (
        <div className="idt-foot">
          {meta}
          {actions && <div className="idt-actions">{actions}</div>}
        </div>
      )}
    </section>
  );
}
