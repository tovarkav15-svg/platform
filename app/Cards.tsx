"use client";

import Link from "next/link";
import { publicMedia, STAGES, type Project, type ProfileCard, type Work } from "@/lib/supabase";
import { NICHES } from "@/lib/niches";
import { profileHref, projectHref } from "@/lib/links";
import { Avatar } from "./Avatar";

const nicheOf = (id: string) => NICHES.find((n) => n.id === id);

function Author({ p }: { p: ProfileCard }) {
  return (
    <Link href={profileHref(p.username)} className="card-author">
      <Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={24} />
      <span>{p.display_name}</span>
    </Link>
  );
}

export function WorkCard({ work, author, onEdit, i = 0 }: { work: Work; author?: ProfileCard; onEdit?: () => void; i?: number }) {
  const n = nicheOf(work.niche);
  const img = publicMedia(work.image_path);
  return (
    <article className="pcard" style={{ "--i": i, "--c": n?.color ?? "var(--ink)" } as React.CSSProperties}>
      <div className={`pcard-media ${img ? "" : "empty"}`}>
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="pcard-glyph caps">{work.title.slice(0, 1)}</span>}
        {n && <span className="pcard-niche">{n.title}</span>}
      </div>
      <div className="pcard-body">
        {author && <Author p={author} />}
        <h3>{work.title}</h3>
        {work.result && <p className="pcard-result">{work.result}</p>}
        {work.description && <p className="pcard-text">{work.description}</p>}
        <div className="pcard-foot">
          {work.link ? <a href={work.link} target="_blank" rel="noopener noreferrer nofollow">Открыть</a> : <span />}
          {onEdit && <button type="button" className="link-btn" onClick={onEdit}>Изменить</button>}
        </div>
      </div>
    </article>
  );
}

export function ProjectCard({ project, author, onEdit, pinned, i = 0 }: { project: Project; author?: ProfileCard; onEdit?: () => void; pinned?: boolean; i?: number }) {
  const n = nicheOf(project.niche);
  const img = publicMedia(project.image_path);
  return (
    <article className={`pcard project ${pinned ? "pinned" : ""}`} style={{ "--i": i, "--c": n?.color ?? "var(--ink)" } as React.CSSProperties}>
      <Link href={projectHref(project.id)} className={`pcard-media ${img ? "" : "empty"}`}>
        {img ? <img src={img} alt="" loading="lazy" /> : <span className="pcard-glyph caps">{project.name.slice(0, 1)}</span>}
        <span className={`stage stage-${project.stage}`}>{STAGES[project.stage]}</span>
        {pinned && <span className="pcard-niche">Закреплён</span>}
      </Link>
      <div className="pcard-body">
        {author && <Author p={author} />}
        <h3><Link href={projectHref(project.id)}>{project.name}</Link></h3>
        {project.tagline && <p className="pcard-text">{project.tagline}</p>}
        {project.looking_for && <p className="looking"><b>Ищу:</b> {project.looking_for}</p>}
        <div className="pcard-foot">
          <Link href={projectHref(project.id)}>Подробнее</Link>
          {onEdit && <button type="button" className="link-btn" onClick={onEdit}>Изменить</button>}
        </div>
      </div>
    </article>
  );
}
