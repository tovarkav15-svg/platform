"use client";

import Link from "next/link";
import type { FriendState, ProfileCard } from "@/lib/supabase";
import { parseNiches } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { Avatar } from "./Avatar";
import { RoleBadge } from "./ProfileHeader";
import { FriendActions } from "./FriendActions";

export function PeopleList({ people, stateOf, onChange, extra }: {
  people: ProfileCard[];
  stateOf?: (id: string) => FriendState;
  onChange?: () => void;
  extra?: (p: ProfileCard) => React.ReactNode;
}) {
  return (
    <ul className="people">
      {people.map((p, i) => (
        <li key={p.id} className="person" style={{ "--i": i } as React.CSSProperties}>
          <Link href={profileHref(p.username)} className="person-main">
            <span className="avatar-wrap sm">
              <Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={52} />
              {p.open_to_work && <span className="otw-dot" title="Открыт к работе" />}
            </span>
            <span className="person-text">
              <b>{p.display_name}<RoleBadge role={p.role} small /></b>
              <small>@{p.username}{p.headline && <span className="headline"> · {p.headline}</span>}</small>
              <span className="person-niches">
                {parseNiches(p.niches).slice(0, 3).map((n) => (
                  <span key={n.id} className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>
                ))}
                {p.city && <span className="skill">{p.city}</span>}
              </span>
              {extra?.(p)}
            </span>
          </Link>
          {stateOf && <FriendActions userId={p.id} state={stateOf(p.id)} compact onChange={onChange} />}
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, text, cta }: { title: string; text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="empty">
      <b className="caps">{title}</b>
      <p className="lead">{text}</p>
      {cta && <Link className="btn" href={cta.href}>{cta.label}</Link>}
    </div>
  );
}
