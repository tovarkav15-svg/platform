"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicMedia, type ProfileCard } from "@/lib/supabase";
import { NICHES } from "@/lib/niches";
import { profileHref } from "@/lib/links";
import { RoleBadge } from "../ProfileHeader";
import { Modal } from "../Modal";

export type JobCase = { title: string; link: string; image_path?: string | null };
export type Job = {
  id: string; user_id: string; service: string; niche: string; description: string; avg_check: number;
  photo_path: string | null; cases: JobCase[]; active: boolean; created_at: string; updated_at: string;
};
export type JobRow = Job & { author: ProfileCard };

export const rub = (n: number) => (n ? `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ")} ₽` : "по договорённости");
const nicheOf = (id: string) => NICHES.find((n) => n.id === id);
const photoOf = (j: JobRow) => publicMedia(j.photo_path) ?? j.author.avatar;

/** Бейдж на ленточке: висит, раскачивается при наведении */
export function JobBadge({ job, i, onOpen, photo: photoOverride }: { job: JobRow; i: number; onOpen: () => void; photo?: string | null }) {
  const n = nicheOf(job.niche);
  const photo = photoOverride ?? photoOf(job);
  return (
    <div className="bd-wrap" style={{ "--i": i, "--c": n?.color ?? "#141414", "--sw": `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` } as React.CSSProperties}>
      <span className="bd-strap" aria-hidden="true" />
      <button type="button" className="bd" onClick={onOpen} aria-label={`${job.service}, ${job.author.display_name}`}>
        <span className="bd-clip" aria-hidden="true" />
        <span className="bd-holo" aria-hidden="true" />
        <span className="bd-top">
          <span className="bd-niche"><i />{n?.title ?? "Услуга"}</span>
          <span className="bd-no mono">№{String(i + 1).padStart(3, "0")}</span>
        </span>
        <span className="bd-photo">
          {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="caps">{job.author.display_name.slice(0, 1)}</span>}
        </span>
        <span className="bd-name"><b>{job.author.display_name}</b><RoleBadge role={job.author.role} small /></span>
        <span className="bd-handle it">@{job.author.username}</span>
        <span className="bd-service">{job.service}</span>
        <span className="bd-check"><small>средний чек</small><b className="mono">{rub(job.avg_check)}</b></span>
        <span className="bd-foot">
          <span>{job.cases.length ? `${job.cases.length} ${job.cases.length === 1 ? "кейс" : job.cases.length < 5 ? "кейса" : "кейсов"}` : "без кейсов"}</span>
          <span className="bd-more">Открыть →</span>
        </span>
      </button>
    </div>
  );
}

/** 3D-карусель лучших карточек: крутится сама, останавливается под курсором */
export function Coverflow({ jobs, onOpen }: { jobs: JobRow[]; onOpen: (j: JobRow) => void }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || jobs.length < 2) return;
    const t = setTimeout(() => setIdx((v) => (v + 1) % jobs.length), 3800);
    return () => clearTimeout(t);
  }, [idx, paused, jobs.length]);
  if (!jobs.length) return null;

  return (
    <div className="cf" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="cf-stage">
        {jobs.map((j, k) => {
          let d = k - idx;
          if (d > jobs.length / 2) d -= jobs.length;
          if (d < -jobs.length / 2) d += jobs.length;
          const n = nicheOf(j.niche);
          const photo = photoOf(j);
          return (
            <button key={j.id} type="button" className={`cf-card ${d === 0 ? "on" : ""}`} hidden={Math.abs(d) > 2}
              style={{ "--d": d, "--ad": Math.abs(d), "--c": n?.color ?? "#141414" } as React.CSSProperties}
              onClick={() => (d === 0 ? onOpen(j) : setIdx(k))} aria-label={j.service}>
              <span className="cf-photo">{photo ? <img src={photo} alt="" /> : <span className="caps">{j.author.display_name.slice(0, 1)}</span>}</span>
              <span className="cf-info">
                <span className="cf-niche">{n?.title ?? "Услуга"}</span>
                <b>{j.service}</b>
                <span className="cf-row"><span>{j.author.display_name}</span><em className="mono">{rub(j.avg_check)}</em></span>
              </span>
            </button>
          );
        })}
      </div>
      {jobs.length > 1 && (
        <div className="cf-dots">
          {jobs.map((_, k) => <button key={k} type="button" aria-label={`Карточка ${k + 1}`} aria-pressed={k === idx} onClick={() => setIdx(k)} />)}
        </div>
      )}
    </div>
  );
}

/** Подробная карточка вакансии */
export function JobDetail({ job, onClose, onWrite, onEdit, canWrite }: {
  job: JobRow | null; onClose: () => void; onWrite: () => void; onEdit?: () => void; canWrite: boolean;
}) {
  const n = job ? nicheOf(job.niche) : null;
  const photo = job ? photoOf(job) : null;
  return (
    <Modal open={!!job} onClose={onClose} title={job ? <>{job.service}</> : ""}>
      {job && (
        <div className="jd" style={{ "--c": n?.color ?? "#141414" } as React.CSSProperties}>
          <div className="jd-hero">
            <span className="jd-photo">{photo ? <img src={photo} alt="" /> : <span className="caps">{job.author.display_name.slice(0, 1)}</span>}</span>
            <div className="jd-who">
              <span className="label">{n?.title ?? "Услуга"}</span>
              <Link href={profileHref(job.author.username)} className="jd-name"><b>{job.author.display_name}</b> <RoleBadge role={job.author.role} small /></Link>
              <span className="it">@{job.author.username}</span>
            </div>
            <div className="jd-check"><small>средний чек</small><b className="mono">{rub(job.avg_check)}</b></div>
          </div>
          {job.description && <p className="jd-desc">{job.description}</p>}
          {job.cases.length > 0 && (
            <div className="jd-cases">
              <span className="label">Портфолио / кейсы</span>
              <ol>
                {job.cases.map((c, k) => (
                  <li key={k} style={{ "--k": k } as React.CSSProperties}>
                    <span className="mono">{String(k + 1).padStart(2, "0")}</span>
                    {c.link ? <a href={c.link} target="_blank" rel="noopener noreferrer nofollow">{c.title || c.link.replace(/^https?:\/\//, "")} ↗</a> : <b>{c.title}</b>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="editor-actions">
            <Link href={profileHref(job.author.username)} className="btn ghost">Профиль</Link>
            {onEdit ? <button type="button" className="btn" onClick={onEdit}>Изменить</button>
              : canWrite ? <button type="button" className="btn" onClick={onWrite}>Написать в чат</button>
              : <Link href="/login" className="btn">Войти, чтобы написать</Link>}
          </div>
        </div>
      )}
    </Modal>
  );
}


