"use client";

import Link from "next/link";
import type { FriendState, ProfileCard } from "@/lib/supabase";
import { parseNiches } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import type { Deco } from "@/lib/shop";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";
import { FriendActions } from "../FriendActions";
import { TitleChip, WithRing } from "../Deco";

export function Grid({ people, decos, stateOf, reload }: { people: ProfileCard[]; decos: Record<string, Deco>; stateOf: (id: string) => FriendState; reload: () => void }) {
  return (
    <ul className="pp-grid">
      {people.map((p, i) => <PersonCard key={p.id} p={p} i={i} deco={decos[p.id]} state={stateOf(p.id)} reload={reload} />)}
    </ul>
  );
}

export function PersonCard({ p, i, deco, state, reload }: { p: ProfileCard; i: number; deco?: Deco; state: FriendState; reload: () => void }) {
  const niches = parseNiches(p.niches);
  const skills = p.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  return (
    <li className={`pp-card ${p.open_to_work ? "is-open" : ""}`} style={{ "--c": niches[0]?.color ?? "#141414", "--i": Math.min(i, 12) } as React.CSSProperties}>
      {p.open_to_work && <span className="pp-otw">открыт к работе</span>}
      <Link href={profileHref(p.username)} className="pp-card-main">
        <WithRing id={deco?.ring}><Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={64} userId={p.id} /></WithRing>
        <span className="pp-name"><b>{p.display_name}</b><RoleBadge role={p.role} small support={p.is_support} /></span>
        <span className="pp-handle">@{p.username}{p.city && ` · ${p.city}`}</span>
        <TitleChip id={deco?.title} small />
        {p.headline && <span className="pp-headline">{p.headline}</span>}
        {(niches.length > 0 || skills.length > 0) && (
          <span className="pp-tags">
            {niches.slice(0, 2).map((n) => <span key={n.id} className="pp-tag" style={{ "--c": n.color } as React.CSSProperties}><i />{n.title}</span>)}
            {skills.map((s) => <span key={s} className="pp-tag skill">{s}</span>)}
          </span>
        )}
      </Link>
      <div className="pp-card-actions">
        {state === "friends" && <span className="pp-friend">✓ в друзьях</span>}
        <FriendActions userId={p.id} state={state} compact onChange={reload} />
      </div>
    </li>
  );
}
