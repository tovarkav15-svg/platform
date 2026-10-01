"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { publicMedia, type ProfileCard } from "@/lib/supabase";
import { NICHES } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";

export type JobCase = { title: string; link: string; image_path?: string | null };
export type Job = {
  id: string; user_id: string; service: string; niche: string; description: string; avg_check: number;
  photo_path: string | null; cases: JobCase[]; active: boolean; created_at: string; updated_at: string;
};

const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽`;

/** Фотокарточка вакансии: наклоняется за курсором, по клику переворачивается */
export function JobCard({ job, author, i, onWrite, onEdit }: { job: Job; author: ProfileCard; i: number; onWrite?: () => void; onEdit?: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const niche = NICHES.find((n) => n.id === job.niche);
  const photo = publicMedia(job.photo_path) ?? author.avatar;

  const tilt = (e: React.PointerEvent) => {
    const el = card.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  const reset = () => { const el = card.current; if (el) { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); } };

  return (
    <div className="job-wrap" style={{ "--i": i, "--c": niche?.color ?? "#141414" } as React.CSSProperties}>
      <div ref={card} className={`job ${flipped ? "flipped" : ""}`} onPointerMove={tilt} onPointerLeave={reset}>
        {/* Лицевая сторона: фото, имя, ниша, услуга, чек */}
        <div className="job-face job-front" onClick={() => setFlipped(true)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped(true); } }} aria-label={`${job.service}: подробнее`}>
          <div className="job-photo">
            {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="job-photo-ph caps">{author.display_name.slice(0, 1)}</span>}
            <span className="job-shine" />
            {niche && <span className="job-niche"><i />{niche.title}</span>}
            <span className="job-check"><small>средний чек</small><b className="mono">{job.avg_check ? rub(job.avg_check) : "по договорённости"}</b></span>
          </div>
          <div className="job-caption">
            <span className="job-who">
              <Avatar name={author.display_name} avatar={author.avatar} accent={author.accent} size={28} />
              <b>{author.display_name}</b><RoleBadge role={author.role} small />
            </span>
            <h3>{job.service}</h3>
            <span className="job-hint">Нажми, чтобы перевернуть ↻</span>
          </div>
        </div>

        {/* Оборот: описание, кейсы, контакт */}
        <div className="job-face job-back">
          <header>
            <span className="label">{niche?.title ?? "Услуга"}</span>
            <button type="button" className="icon-btn sm" onClick={() => setFlipped(false)} aria-label="Перевернуть обратно">↺</button>
          </header>
          <h3>{job.service}</h3>
          {job.description && <p className="job-desc">{job.description}</p>}
          <div className="job-row"><span>Средний чек</span><b className="mono">{job.avg_check ? rub(job.avg_check) : "по договорённости"}</b></div>
          {job.cases.length > 0 && (
            <div className="job-cases">
              <span className="label">Портфолио / кейсы</span>
              <ul>
                {job.cases.map((c, k) => (
                  <li key={k} style={{ "--k": k } as React.CSSProperties}>
                    {c.link ? <a href={c.link} target="_blank" rel="noopener noreferrer nofollow">{c.title || c.link.replace(/^https?:\/\//, "")} ↗</a> : <span>{c.title}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="job-actions">
            <Link href={profileHref(author.username)} className="btn ghost sm">@{author.username}</Link>
            {onEdit ? <button type="button" className="btn sm" onClick={onEdit}>Изменить</button>
              : onWrite ? <button type="button" className="btn sm" onClick={onWrite}>Написать в чат</button>
              : <Link href="/login" className="btn sm">Войти, чтобы написать</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
