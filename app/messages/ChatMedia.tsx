"use client";

import { useEffect, useRef, useState } from "react";
import { chatFileUrl, formatBytes } from "@/lib/upload";

export type MediaMeta = { name?: string; size?: number; duration?: number; w?: number; h?: number; local?: string };

/** Временная ссылка на файл чата (или локальная, пока файл ещё грузится) */
function useMediaUrl(path: string | null, local?: string) {
  const [url, setUrl] = useState<string | null>(local ?? null);
  useEffect(() => {
    if (local) return setUrl(local);
    if (!path) return;
    let alive = true;
    chatFileUrl(path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path, local]);
  return url;
}

const mmss = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export function ImageMedia({ path, meta }: { path: string | null; meta: MediaMeta }) {
  const url = useMediaUrl(path, meta.local);
  const ratio = meta.w && meta.h ? `${meta.w} / ${meta.h}` : "4 / 3";
  return (
    <a className="media-img" href={url ?? undefined} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: ratio }}>
      {url ? <img src={url} alt={meta.name ?? "Фото"} loading="lazy" /> : <span className="media-loading" />}
    </a>
  );
}

export function VideoMedia({ path, meta }: { path: string | null; meta: MediaMeta }) {
  const url = useMediaUrl(path, meta.local);
  return (
    <div className="media-video">
      {url ? <video src={url} controls playsInline preload="metadata" /> : <span className="media-loading" />}
    </div>
  );
}

export function FileMedia({ path, meta }: { path: string | null; meta: MediaMeta }) {
  const url = useMediaUrl(path, meta.local);
  const ext = (meta.name?.split(".").pop() ?? "файл").slice(0, 4).toUpperCase();
  return (
    <a className="media-file" href={url ?? undefined} target="_blank" rel="noopener noreferrer">
      <span className="media-file-icon">{ext}</span>
      <span className="media-file-text">
        <b>{meta.name ?? "Файл"}</b>
        <small>{meta.size ? formatBytes(meta.size) : ""}{url ? " · открыть" : ""}</small>
      </span>
    </a>
  );
}

export function VoiceMedia({ path, meta, mine }: { path: string | null; meta: MediaMeta; mine: boolean }) {
  const url = useMediaUrl(path, meta.local);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(meta.duration ?? 0);

  // Только одно голосовое играет одновременно
  useEffect(() => {
    const stopOthers = (e: Event) => { if (e.target !== audio.current) audio.current?.pause(); };
    document.addEventListener("play", stopOthers, true);
    return () => document.removeEventListener("play", stopOthers, true);
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  const pct = duration ? Math.min(100, (time / duration) * 100) : 0;
  // Стабильные «волны» из id файла, чтобы у каждого голосового был свой рисунок
  const seed = (path ?? meta.local ?? "x").split("").reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const bars = Array.from({ length: 28 }, (_, i) => 25 + (((seed >> (i % 24)) ^ (i * 2654435761)) >>> 0) % 75);

  return (
    <div className={`voice ${mine ? "mine" : ""}`}>
      <button type="button" className="voice-play" onClick={toggle} disabled={!url} aria-label={playing ? "Пауза" : "Слушать"}>
        {playing
          ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>
          : <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>}
      </button>
      <div className="voice-wave" onClick={seek} role="slider" aria-label="Перемотка" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}>
        {bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} className={(i / bars.length) * 100 < pct ? "on" : ""} />)}
      </div>
      <span className="voice-time">{mmss(playing || time ? time : duration)}</span>
      {url && (
        <audio
          ref={audio} src={url} preload="metadata"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setTime(0); }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDuration(d); }}
        />
      )}
    </div>
  );
}

/** Запись голосового: нажал — пишет, «Отправить» — готово, «×» — отмена */
export function useVoiceRecorder(onDone: (blob: Blob, duration: number) => void) {
  const [state, setState] = useState<"idle" | "recording" | "denied">("idle");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      cancelled.current = false;
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        const duration = (Date.now() - started.current) / 1000;
        setState("idle");
        setSeconds(0);
        if (cancelled.current || duration < 0.6) return;
        const base = (r.mimeType || type || "audio/webm").split(";")[0];
        onDone(new Blob(chunks.current, { type: base }), duration);
      };
      r.start(250);
      rec.current = r;
      started.current = Date.now();
      setState("recording");
      timer.current = setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setSeconds(s);
        if (s >= 300) r.stop(); // не длиннее 5 минут
      }, 200);
    } catch {
      setState("denied");
    }
  };

  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  const cancel = () => { cancelled.current = true; stop(); };

  useEffect(() => () => { cancelled.current = true; if (rec.current?.state === "recording") rec.current.stop(); }, []);

  return { state, seconds, start, stop, cancel, label: mmss(seconds) };
}

/** Размеры картинки, чтобы лента не прыгала при загрузке */
export function imageSize(file: Blob): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(img.src); };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}
