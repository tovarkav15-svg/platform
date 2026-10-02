"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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

/** Раскачка на пружине: под курсором бейдж качается и клонится к нему, без курсора плавно затухает */
function useSwing(amp: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let a = 0, v = 0, hover = false, lean = 0, t0 = 0, last = 0, raf = 0;
    const step = (t: number) => {
      const dt = Math.min(0.032, (t - (last || t)) / 1000) || 0.016;
      last = t;
      const target = hover ? amp * Math.sin((t - t0) / 420) + lean : 0;
      v += ((target - a) * 60 - v * (hover ? 9 : 5.5)) * dt;
      a += v * dt;
      el.style.rotate = `${a.toFixed(3)}deg`;
      if (!hover && Math.abs(a) < 0.02 && Math.abs(v) < 0.02) { el.style.rotate = ""; raf = 0; last = 0; return; }
      raf = requestAnimationFrame(step);
    };
    const run = () => { if (!raf) raf = requestAnimationFrame(step); };
    const enter = () => { hover = true; t0 = performance.now(); run(); };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); lean = ((e.clientX - r.left) / r.width - 0.5) * -amp * 1.4; };
    const leave = () => { hover = false; lean = 0; run(); };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointerenter", enter); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, [amp]);
  return ref;
}

/** Бейдж на ленточке: висит, раскачивается при наведении. onChat — сразу написать автору */
export function JobBadge({ job, i, onOpen, onChat, photo: photoOverride, rating }: { job: JobRow; i: number; onOpen: () => void; onChat?: () => void; photo?: string | null; rating?: { avg: number; n: number } }) {
  const n = nicheOf(job.niche);
  const photo = photoOverride ?? photoOf(job);
  const swing = useSwing(2.5 + (i % 3));
  return (
    <div ref={swing} className={`bd-wrap ${onChat ? "has-chat" : ""}`} style={{ "--i": i, "--c": n?.color ?? "#141414", "--sw": `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg` } as React.CSSProperties}>
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
        <span className="bd-name"><b>{job.author.display_name}</b><RoleBadge role={job.author.role} small support={job.author.is_support} /></span>
        <span className="bd-handle it">@{job.author.username}</span>
        {rating && <span className="bd-rating"><b>★ {rating.avg.toFixed(1)}</b><small>{rating.n} {rating.n === 1 ? "отзыв" : rating.n < 5 ? "отзыва" : "отзывов"}</small></span>}
        <span className="bd-service">{job.service}</span>
        <span className="bd-check"><small>средний чек</small><b className="mono">{rub(job.avg_check)}</b></span>
        <span className="bd-foot">
          <span>{job.cases.length ? `${job.cases.length} ${job.cases.length === 1 ? "кейс" : job.cases.length < 5 ? "кейса" : "кейсов"}` : "без кейсов"}</span>
          <span className="bd-more">Открыть →</span>
        </span>
      </button>
      {onChat && (
        <button type="button" className="bd-chat" onClick={onChat} aria-label={`Написать ${job.author.display_name} в чат`}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3 0-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor" /></svg>
          Написать
        </button>
      )}
    </div>
  );
}

/** Живая лента лучших карточек: едет сама без остановки, под курсором замедляется и стоит */
export function Coverflow({ jobs, onOpen }: { jobs: JobRow[]; onOpen: (j: JobRow) => void }) {
  if (!jobs.length) return null;
  // Повторяем карточки, чтобы лента была длиннее экрана, и удваиваем её для бесшовного круга
  const reps = Math.max(1, Math.ceil(8 / jobs.length));
  const loop = Array.from({ length: reps }, () => jobs).flat();
  const track = [...loop, ...loop];
  return (
    <div className="mq" style={{ "--n": loop.length } as React.CSSProperties}>
      <div className="mq-track">
        {track.map((j, k) => {
          const nn = nicheOf(j.niche);
          const photo = photoOf(j);
          return (
            <button key={`${j.id}-${k}`} type="button" className="mq-card" style={{ "--c": nn?.color ?? "#141414", "--k": k % loop.length } as React.CSSProperties}
              onClick={() => onOpen(j)} aria-label={j.service} tabIndex={k < loop.length ? 0 : -1} aria-hidden={k >= loop.length || undefined}>
              <span className="cf-photo">{photo ? <img src={photo} alt="" draggable={false} /> : <span className="caps">{j.author.display_name.slice(0, 1)}</span>}</span>
              <span className="cf-info">
                <span className="cf-niche">{nn?.title ?? "Услуга"}</span>
                <b>{j.service}</b>
                <span className="cf-row"><span>{j.author.display_name}</span><em className="mono">{rub(j.avg_check)}</em></span>
              </span>
            </button>
          );
        })}
      </div>
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
              <Link href={profileHref(job.author.username)} className="jd-name"><b>{job.author.display_name}</b> <RoleBadge role={job.author.role} small support={job.author.is_support} /></Link>
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


