import { accentColor } from "@/lib/style";
import { isOwner } from "@/lib/supabase";
import { PresenceDot, PresenceLabel } from "./Avatar";
import { BannerFx, RingFx, TitleChip } from "./Deco";
import { OverlayFx, SceneFx } from "./Scenes";
import type { Deco } from "@/lib/shop";

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
  userId?: string;
  ring?: string;
  nameStyle?: string;
  emoji?: string;
  support?: boolean;
  deco?: Partial<Deco> | null;   // надетое из AURA Shop
};

export function RoleBadge({ role, small, support }: { role?: string; small?: boolean; support?: boolean }) {
  return (
    <>
      {isOwner(role) && <span className={`badge owner ${small ? "sm" : ""}`}>Owner</span>}
      {support && <span className={`badge support ${small ? "sm" : ""}`} title="Команда поддержки платформы">Поддержка</span>}
    </>
  );
}

export function Banner({ image, preset = "aurora", className = "", scene, overlay }: { image?: string | null; preset?: string; className?: string; scene?: string | null; overlay?: string | null }) {
  return (
    <div className={`ph2-banner bn-${image ? "image" : preset} ${className}`}>
      {image
        ? /\.(mp4|webm)(\?|$)/i.test(image) || image.startsWith("blob:video")
          ? <video src={image.replace(/^blob:video/, "blob:")} autoPlay muted loop playsInline preload="metadata" />
          : <img src={image} alt="" />
        : <><i className="bn-l1" /><i className="bn-l2" /><i className="bn-l3" /></>}
      <SceneFx id={scene} />
      <OverlayFx id={overlay} />
    </div>
  );
}

// Шапка профиля: баннер, аватар с кольцом, имя. Используется в профиле и как живое превью в настройках.
// Порядок блоков: кто это (имя, ник, значки) → чем занят сейчас и о себе → где найти (присутствие, город, ссылки)
export function ProfileHeader({ displayName, username, headline, bio, status, openToWork, accent, avatar, role, banner, bannerPreset, meta, actions, compact, userId, ring = "spin", nameStyle = "plain", emoji, support, deco }: Props) {
  const hasTags = isOwner(role) || support || !!deco?.title || openToWork;
  return (
    <section className={`ph2 ${compact ? "compact" : ""} ${deco?.banner ? "has-fx" : ""}`} style={{ "--c": accentColor(accent) } as React.CSSProperties}>
      <BannerFx id={deco?.banner} />
      <Banner image={banner} preset={bannerPreset} scene={deco?.scene} overlay={deco?.overlay} />
      <div className="ph2-body">
        <div className={`ph2-avatar ring-${ring} ${openToWork ? "otw-on" : ""}`}>
          <span className="ph2-ring" />
          <RingFx id={deco?.ring} />
          <div className="avatar">
            {avatar ? <img src={avatar} alt="" /> : (displayName || username || "?").slice(0, 1).toUpperCase()}
          </div>
          {userId && <span className="ph2-pres"><PresenceDot userId={userId} size={128} /></span>}
        </div>
        <div className="ph2-id">
          <div className="ph2-name">
            <h1 className={`caps name-${nameStyle} ${deco?.name_fx ? `fx-name ${deco.name_fx}` : ""}`} data-text={displayName || "Имя"}>{displayName || "Имя"}</h1>
            {emoji && <span className="name-emoji" aria-hidden="true">{emoji}</span>}
          </div>
          <span className="ph2-handle"><b>@{username || "username"}</b>{headline && <span>{headline}</span>}</span>
          {hasTags && (
            <div className="ph2-tags">
              {openToWork && <span className="ph2-otw">Открыт к работе</span>}
              <RoleBadge role={role} support={support} />
              <TitleChip id={deco?.title} />
            </div>
          )}
        </div>
        {actions && <div className="ph2-actions">{actions}</div>}
      </div>
      {(bio || status || meta || userId) && (
        <div className="ph2-foot">
          {(bio || status) && (
            <div className="ph2-text">
              {status && <p className="ph2-now"><span>Сейчас</span>{status}</p>}
              {bio && <p className="ph2-bio">{bio}</p>}
            </div>
          )}
          {(meta || userId) && (
            <div className="ph2-meta">
              {userId && <PresenceLabel userId={userId} />}
              {meta}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
