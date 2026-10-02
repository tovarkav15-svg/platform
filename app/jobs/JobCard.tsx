"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
export function JobBadge({ job, i, onOpen, onChat, photo: photoOverride }: { job: JobRow; i: number; onOpen: () => void; onChat?: () => void; photo?: string | null }) {
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

/** Лента лучших карточек: листается вбок сама, стрелками и свайпом; под курсором стоит */
export function Coverflow({ jobs, onOpen }: { jobs: JobRow[]; onOpen: (j: JobRow) => void }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const n = jobs.length;
  const go = (step: number) => setIdx((v) => (v + step + n) % n);
  useEffect(() => {
    if (paused || n < 2) return;
    const t = setTimeout(() => go(1), 4200);
    return () => clearTimeout(t);
  }, [idx, paused, n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!n) return null;

  return (
    <div className={`cf cf-side ${drag.current ? "dragging" : ""}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); }}>
      <div className="cf-stage" style={{ "--dx": `${dx}px` } as React.CSSProperties}
        onPointerDown={(e) => { drag.current = { x: e.clientX, moved: false }; }}
        onPointerMove={(e) => { if (!drag.current) return; const d = e.clientX - drag.current.x; if (Math.abs(d) > 6) drag.current.moved = true; setDx(d); }}
        onPointerUp={() => { if (!drag.current) return; if (dx < -60) go(1); else if (dx > 60) go(-1); setDx(0); setTimeout(() => { drag.current = null; }, 0); }}
        onPointerLeave={() => { if (drag.current) { setDx(0); drag.current = null; } }}>
        {jobs.map((j, k) => {
          let d = k - idx;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          const nn = nicheOf(j.niche);
          const photo = photoOf(j);
          return (
            <button key={j.id} type="button" className={`cf-card ${d === 0 ? "on" : ""}`} hidden={Math.abs(d) > 3} tabIndex={d === 0 ? 0 : -1}
              style={{ "--d": d, "--ad": Math.abs(d), "--c": nn?.color ?? "#141414" } as React.CSSProperties}
              onClick={() => { if (drag.current?.moved) return; if (d === 0) onOpen(j); else setIdx(k); }} aria-label={j.service}>
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
      {n > 1 && (
        <>
          <button type="button" className="cf-arrow prev" aria-label="Назад" onClick={() => go(-1)}>‹</button>
          <button type="button" className="cf-arrow next" aria-label="Дальше" onClick={() => go(1)}>›</button>
          <div className="cf-dots">
            {jobs.map((_, k) => <button key={k} type="button" aria-label={`Карточка ${k + 1}`} aria-pressed={k === idx} onClick={() => setIdx(k)}>{k === idx && !paused && <i key={idx} />}</button>)}
          </div>
        </>
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


