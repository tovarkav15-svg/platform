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
  cover: string;
  avatar?: string | null;
  role?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
};

export function RoleBadge({ role, small }: { role?: string; small?: boolean }) {
  if (!isOwner(role)) return null;
  return <span className={`badge owner ${small ? "sm" : ""}`}>Owner</span>;
}

// Шапка профиля. Используется и на странице профиля, и как живое превью в настройках
export function ProfileHeader({ displayName, username, headline, bio, status, openToWork, accent, cover, avatar, role, meta, actions }: Props) {
  return (
    <section className="profile-head" data-cover={cover} style={{ "--c": accentColor(accent) } as React.CSSProperties}>
      <div className="avatar-wrap">
        <div className="avatar">
          {avatar ? <img src={avatar} alt="" /> : (displayName || username || "?").slice(0, 1).toUpperCase()}
        </div>
        {openToWork && <span className="otw" title="Открыт к сотрудничеству">Открыт к работе</span>}
      </div>
      <div className="info">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h1 className="caps">{displayName || "Имя"}</h1>
          <RoleBadge role={role} />
        </div>
        <span className="handle">@{username || "username"}{headline && <span className="headline"> · {headline}</span>}</span>
        {status && <span className="status-line"><i />{status}</span>}
        {bio && <p className="lead">{bio}</p>}
        {meta}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </section>
  );
}
