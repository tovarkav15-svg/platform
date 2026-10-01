import { accentColor } from "@/lib/style";

type Props = {
  displayName: string;
  username: string;
  bio?: string;
  accent: string;
  cover: string;
  avatar?: string | null;
  founder?: boolean;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
};

// Шапка профиля. Используется и на странице профиля, и как живое превью в настройках
export function ProfileHeader({ displayName, username, bio, accent, cover, avatar, founder, meta, actions }: Props) {
  return (
    <section className="profile-head" data-cover={cover} style={{ "--c": accentColor(accent) } as React.CSSProperties}>
      <div className="avatar">
        {avatar ? <img src={avatar} alt="" /> : (displayName || username || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="info">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h1 className="caps">{displayName || "Имя"}</h1>
          {founder && <span className="badge">Основатель</span>}
        </div>
        <span className="handle">@{username || "username"}</span>
        {bio && <p className="lead">{bio}</p>}
        {meta}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </section>
  );
}
