import { accentColor } from "@/lib/style";
import { isOwner } from "@/lib/supabase";
import { PresenceDot, PresenceLabel } from "./Avatar";

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
};

export function RoleBadge({ role, small, support }: { role?: string; small?: boolean; support?: boolean }) {
  return (
    <>
      {isOwner(role) && <span className={`badge owner ${small ? "sm" : ""}`}>Owner</span>}
      {support && <span className={`badge support ${small ? "sm" : ""}`} title="Команда поддержки платформы">Поддержка</span>}
    </>
  );
}

export function Banner({ image, preset = "aurora", className = "" }: { image?: string | null; preset?: string; className?: string }) {
  return (
    <div className={`ph2-banner bn-${image ? "image" : preset} ${className}`}>
      {image ? <img src={image} alt="" /> : <><i className="bn-l1" /><i className="bn-l2" /><i className="bn-l3" /></>}
    </div>
  );
}

// Шапка профиля: баннер, аватар с кольцом, имя. Используется в профиле и как живое превью в настройках
export function ProfileHeader({ displayName, username, headline, bio, status, openToWork, accent, avatar, role, banner, bannerPreset, meta, actions, compact, userId, ring = "spin", nameStyle = "plain", emoji, support }: Props) {
  return (
    <section className={`ph2 ${compact ? "compact" : ""}`} style={{ "--c": accentColor(accent) } as React.CSSProperties}>
      <Banner image={banner} preset={bannerPreset} />
      <div className="ph2-body">
        <div className={`ph2-avatar ring-${ring} ${openToWork ? "otw-on" : ""}`}>
          <span className="ph2-ring" />
          <div className="avatar">
            {avatar ? <img src={avatar} alt="" /> : (displayName || username || "?").slice(0, 1).toUpperCase()}
          </div>
          {userId && <span className="ph2-pres"><PresenceDot userId={userId} size={128} /></span>}
          {openToWork && <span className="otw">Открыт к работе</span>}
        </div>
        <div className="ph2-id">
          <div className="ph2-name">
            <h1 className={`caps name-${nameStyle}`}>{displayName || "Имя"}</h1>
            {emoji && <span className="name-emoji" aria-hidden="true">{emoji}</span>}
            <RoleBadge role={role} support={support} />
          </div>
          <span className="handle">@{username || "username"}{headline && <span className="headline"> · {headline}</span>}</span>
          {userId && <PresenceLabel userId={userId} />}
          {status && <span className="status-line"><i />{status}</span>}
        </div>
        {actions && <div className="ph2-actions">{actions}</div>}
      </div>
      {(bio || meta) && (
        <div className="ph2-foot">
          {bio && <p className="ph2-bio">{bio}</p>}
          {meta}
        </div>
      )}
    </section>
  );
}
