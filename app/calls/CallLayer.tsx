"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Avatar } from "../Avatar";

type CallRow = { id: string; chat_id: string; caller: string; callee: string; video: boolean; status: string; created_at: string };
type Phase = "ringing-out" | "ringing-in" | "connecting" | "active" | "ended";
type Active = { call: CallRow; peer: ProfileCard; phase: Phase; outgoing: boolean; note?: string };

// STUN находит прямой путь; TURN пересылает звук и видео, когда прямой путь закрыт (мобильный интернет, офисные сети).
// Свой TURN можно задать в NEXT_PUBLIC_TURN_URL / _USER / _PASS, иначе используется публичный Open Relay
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL;
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:openrelay.metered.ca:80"] },
    TURN_URL
      ? { urls: TURN_URL.split(","), username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS }
      : { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
  ],
};
const RING_MS = 40_000;

const Ctx = createContext<{ startCall: (chatId: string, calleeId: string, video: boolean) => Promise<string | null> }>({ startCall: async () => null });
export const useCalls = () => useContext(Ctx);

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Звонки 1 на 1 по WebRTC. Сигналы (offer/answer/ICE) идут через таблицу call_signals,
 * которую видят только участники звонка, — подделать входящий звонок нельзя.
 */
export function CallLayer({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const [act, setAct] = useState<Active | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remoteVid, setRemoteVid] = useState(false);
  const screen = useRef<MediaStreamTrack | null>(null);
  const lastSignal = useRef(0);
  const [secs, setSecs] = useState(0);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const seen = useRef<Set<number>>(new Set());
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number | null>(null);
  const actRef = useRef<Active | null>(null);
  actRef.current = act;

  const cleanup = useCallback(() => {
    if (ringTimer.current) clearTimeout(ringTimer.current);
    pc.current?.close(); pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
    screen.current?.stop(); screen.current = null; lastSignal.current = 0;
    remoteStream.current = null;
    pendingIce.current = []; seen.current = new Set();
    if (channel.current) supabase.removeChannel(channel.current); channel.current = null;
    startedAt.current = null;
    setMuted(false); setCamOff(false); setSecs(0); setSharing(false); setRemoteVid(false);
  }, []);

  const finish = useCallback(async (status: "ended" | "declined" | "missed", note: string) => {
    const a = actRef.current;
    if (!a) return;
    const duration = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
    cleanup();
    setAct({ ...a, phase: "ended", note });
    await supabase.from("calls").update({ status, ended_at: new Date().toISOString() }).eq("id", a.call.id);
    // Запись о звонке в чат оставляет тот, кто звонил
    if (a.outgoing) {
      const kind = a.call.video ? "Видеозвонок" : "Аудиозвонок";
      const text = status === "ended" && duration > 0 ? `📞 ${kind} · ${mmss(duration)}` : status === "declined" ? `📞 ${kind} · отклонён` : `📞 ${kind} · без ответа`;
      await supabase.from("messages").insert({ chat_id: a.call.chat_id, text });
      window.dispatchEvent(new Event("chats:refresh"));
    }
    setTimeout(() => setAct((cur) => (cur?.call.id === a.call.id ? null : cur)), 1800);
  }, [cleanup]);

  const send = useCallback(async (callId: string, data: unknown) => {
    await supabase.from("call_signals").insert({ call_id: callId, data });
  }, []);

  const makePeer = useCallback(async (call: CallRow) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.video ? { width: 1280, height: 720 } : false });
    local.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    const p = new RTCPeerConnection(ICE);
    stream.getTracks().forEach((t) => p.addTrack(t, stream));
    // В аудиозвонке заранее держим пустой видео-канал под демонстрацию экрана
    if (!call.video) p.addTransceiver("video", { direction: "sendrecv", streams: [stream] });
    p.onicecandidate = (e) => { if (e.candidate) send(call.id, { type: "ice", candidate: e.candidate.toJSON() }); };
    p.ontrack = (e) => {
      const st = e.streams[0] ?? remoteStream.current ?? new MediaStream();
      if (!e.streams[0]) st.addTrack(e.track);
      remoteStream.current = st;
      if (remoteVideo.current) remoteVideo.current.srcObject = st;
      if (e.track.kind === "video") {
        // Видео собеседника (камера или его экран): показываем, пока идут кадры
        e.track.onunmute = () => setRemoteVid(true);
        e.track.onmute = () => setRemoteVid(false);
        if (!e.track.muted) setRemoteVid(true);
      }
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === "connected") {
        startedAt.current = startedAt.current ?? Date.now();
        setAct((a) => (a ? { ...a, phase: "active" } : a));
      }
      if (p.connectionState === "failed") finish("ended", "Не удалось соединиться. Возможно, сеть блокирует звонки.");
    };
    pc.current = p;
    return p;
  }, [send, finish]);

  const onSignal = useCallback(async (row: { id: number; sender: string; data: { type: string; sdp?: string; candidate?: RTCIceCandidateInit } }) => {
    lastSignal.current = Math.max(lastSignal.current, row.id);
    if (seen.current.has(row.id) || row.sender === me?.id) return;
    seen.current.add(row.id);
    const p = pc.current;
    const d = row.data;
    if (d.type === "answer" && p && !p.currentRemoteDescription) {
      await p.setRemoteDescription({ type: "answer", sdp: d.sdp });
      for (const c of pendingIce.current) await p.addIceCandidate(c).catch(() => {});
      pendingIce.current = [];
    } else if (d.type === "ice" && d.candidate) {
      if (p?.remoteDescription) await p.addIceCandidate(d.candidate).catch(() => {});
      else pendingIce.current.push(d.candidate);
    } else if (d.type === "bye") {
      finish("ended", "Звонок завершён");
    }
  }, [me, finish]);

  const listen = useCallback((callId: string) => {
    channel.current = supabase.channel(`call:${callId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_signals", filter: `call_id=eq.${callId}` }, (payload) => onSignal(payload.new as never))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` }, (payload) => {
        const c = payload.new as CallRow;
        const a = actRef.current;
        if (!a || a.call.id !== c.id) return;
        if (c.status === "declined") finish("declined", "Звонок отклонён");
        else if (c.status === "ended" && a.phase !== "ended") finish("ended", "Звонок завершён");
        else if (c.status === "active" && a.outgoing) setAct({ ...a, phase: "connecting" });
      })
      .subscribe();
  }, [onSignal, finish]);

  // Исходящий звонок
  const startCall = useCallback(async (chatId: string, calleeId: string, video: boolean) => {
    if (!me || actRef.current) return null;
    const [{ data: peer }, { data: call, error }] = await Promise.all([
      supabase.from("profiles").select(PROFILE_CARD + ", focus_until").eq("id", calleeId).single(),
      supabase.from("calls").insert({ chat_id: chatId, callee: calleeId, video }).select("*").single(),
    ]);
    if (error || !call) {
      const f = (peer as unknown as { focus_until: string | null } | null)?.focus_until;
      return f && new Date(f) > new Date() ? `Человек в режиме фокуса до ${new Date(f).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Не получилось позвонить";
    }
    setAct({ call: call as CallRow, peer: peer as unknown as ProfileCard, phase: "ringing-out", outgoing: true });
    listen(call.id);
    try {
      const p = await makePeer(call as CallRow);
      const offer = await p.createOffer();
      await p.setLocalDescription(offer);
      await send(call.id, { type: "offer", sdp: offer.sdp });
    } catch {
      finish("ended", "Нет доступа к микрофону или камере");
      return "Нет доступа к микрофону или камере";
    }
    ringTimer.current = setTimeout(() => { if (actRef.current?.phase === "ringing-out") finish("missed", "Не ответили"); }, RING_MS);
    return null;
  }, [me, listen, makePeer, send, finish]);

  // Подстраховка к Realtime: пока звонок не соединился, раз в 1.5 с дочитываем сигналы и статус из базы
  useEffect(() => {
    const a = act;
    if (!a || a.phase === "active" || a.phase === "ended") return;
    const t = setInterval(async () => {
      const cur = actRef.current;
      if (!cur) return;
      const [{ data: sigs }, { data: c }] = await Promise.all([
        supabase.from("call_signals").select("*").eq("call_id", cur.call.id).gt("id", lastSignal.current).order("id"),
        supabase.from("calls").select("status").eq("id", cur.call.id).maybeSingle(),
      ]);
      if (cur.phase !== "ringing-in") for (const s of sigs ?? []) await onSignal(s as never);
      if (c?.status === "declined" && cur.outgoing) finish("declined", "Звонок отклонён");
      else if (c?.status === "ended" && actRef.current?.phase !== "ended") finish("ended", "Звонок завершён");
      else if (c?.status === "active" && cur.outgoing && cur.phase === "ringing-out") setAct({ ...cur, phase: "connecting" });
    }, 1500);
    return () => clearInterval(t);
  }, [act, onSignal, finish]);

  // Входящие звонки: база отдаёт только звонки, где я — тот, кому звонят
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel(`calls-in:${me.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee=eq.${me.id}` }, async (payload) => {
        const call = payload.new as CallRow;
        if (actRef.current) { await supabase.from("calls").update({ status: "declined" }).eq("id", call.id); return; }
        const { data: peer } = await supabase.from("profiles").select(PROFILE_CARD).eq("id", call.caller).single();
        setAct({ call, peer: peer as unknown as ProfileCard, phase: "ringing-in", outgoing: false });
        listen(call.id);
        ringTimer.current = setTimeout(() => { if (actRef.current?.phase === "ringing-in") { cleanup(); setAct(null); } }, RING_MS);
      })
      .subscribe();
    const poll = setInterval(async () => {
      if (actRef.current) return;
      const { data } = await supabase.from("calls").select("*").eq("callee", me.id).eq("status", "ringing").gt("created_at", new Date(Date.now() - RING_MS).toISOString()).order("created_at", { ascending: false }).limit(1);
      const call = (data as CallRow[] | null)?.[0];
      if (!call || actRef.current) return;
      const { data: peer } = await supabase.from("profiles").select(PROFILE_CARD).eq("id", call.caller).single();
      if (actRef.current) return;
      setAct({ call, peer: peer as unknown as ProfileCard, phase: "ringing-in", outgoing: false });
      listen(call.id);
      ringTimer.current = setTimeout(() => { if (actRef.current?.phase === "ringing-in") { cleanup(); setAct(null); } }, RING_MS);
    }, 4000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [me, listen, cleanup]);

  async function accept() {
    const a = actRef.current;
    if (!a) return;
    if (ringTimer.current) clearTimeout(ringTimer.current);
    setAct({ ...a, phase: "connecting" });
    try {
      const p = await makePeer(a.call);
      const { data: sigs } = await supabase.from("call_signals").select("*").eq("call_id", a.call.id).order("id");
      const offer = (sigs ?? []).find((s) => s.data.type === "offer" && s.sender !== me?.id);
      if (!offer) throw new Error("no offer");
      seen.current.add(offer.id);
      await p.setRemoteDescription({ type: "offer", sdp: offer.data.sdp });
      p.getTransceivers().forEach((t) => { if (t.receiver.track.kind === "video" && t.direction !== "sendrecv") t.direction = "sendrecv"; });
      for (const s of sigs ?? []) {
        lastSignal.current = Math.max(lastSignal.current, s.id);
        if (s.data.type === "ice" && s.sender !== me?.id) { seen.current.add(s.id); await p.addIceCandidate(s.data.candidate).catch(() => {}); }
      }
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      await send(a.call.id, { type: "answer", sdp: answer.sdp });
      await supabase.from("calls").update({ status: "active" }).eq("id", a.call.id);
    } catch {
      finish("ended", "Не получилось ответить: нет доступа к микрофону или камере");
    }
  }

  async function decline() {
    const a = actRef.current;
    if (!a) return;
    await supabase.from("calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", a.call.id);
    cleanup(); setAct(null);
  }

  async function hangup() {
    const a = actRef.current;
    if (!a) return;
    await send(a.call.id, { type: "bye" }).catch(() => {});
    finish(a.phase === "ringing-out" ? "missed" : "ended", "Звонок завершён");
  }

  // Таймер разговора
  useEffect(() => {
    if (act?.phase !== "active") return;
    const t = setInterval(() => setSecs(startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0), 500);
    return () => clearInterval(t);
  }, [act?.phase]);

  // Видео-элементы монтируются позже потоков — подключаем при появлении
  useEffect(() => {
    if (remoteVideo.current && remoteStream.current) remoteVideo.current.srcObject = remoteStream.current;
    if (localVideo.current && local.current) localVideo.current.srcObject = local.current;
  });

  const toggleMute = () => { local.current?.getAudioTracks().forEach((t) => (t.enabled = muted)); setMuted(!muted); };
  const toggleCam = () => { local.current?.getVideoTracks().forEach((t) => (t.enabled = camOff)); setCamOff(!camOff); };
  const videoSender = () => pc.current?.getTransceivers().find((t) => t.receiver.track.kind === "video")?.sender ?? null;
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  async function stopShare() {
    const sender = videoSender();
    const cam = local.current?.getVideoTracks()[0] ?? null;
    await sender?.replaceTrack(cam).catch(() => {});
    screen.current?.stop(); screen.current = null;
    if (localVideo.current && local.current) localVideo.current.srcObject = local.current;
    setSharing(false);
  }
  async function toggleShare() {
    if (sharing) return stopShare();
    try {
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const track = disp.getVideoTracks()[0];
      const sender = videoSender();
      if (!sender) { track.stop(); return; }
      await sender.replaceTrack(track);
      screen.current = track;
      track.onended = () => { stopShare(); };
      if (localVideo.current) localVideo.current.srcObject = disp;
      setSharing(true);
    } catch { /* человек передумал показывать экран */ }
  }

  return (
    <Ctx.Provider value={{ startCall }}>
      {children}
      {act && (
        <div className={`call-layer ph-${act.phase} ${act.call.video ? "video" : "audio"}`} role="dialog" aria-label="Звонок">
          <div className="call-bg" aria-hidden="true"><i /><i /></div>
          {(act.phase === "active" || act.phase === "connecting") && (
            <>
              <video ref={remoteVideo} className={`call-remote ${act.call.video || remoteVid ? "" : "hidden"}`} autoPlay playsInline />
              {(act.call.video || sharing) && <video ref={localVideo} className={`call-local ${sharing ? "screen" : ""}`} autoPlay playsInline muted />}
            </>
          )}
          {act.phase !== "active" && act.phase !== "connecting" && !act.call.video && <audio autoPlay />}
          <div className="call-card">
            <span className="call-rings" aria-hidden="true"><i /><i /><i /></span>
            {act.peer && <Avatar name={act.peer.display_name} avatar={act.peer.avatar} accent={act.peer.accent} size={112} />}
            <b className="call-name">{act.peer?.display_name}</b>
            <span className="call-state">
              {act.phase === "ringing-out" && "Звоним…"}
              {act.phase === "ringing-in" && (act.call.video ? "Входящий видеозвонок" : "Входящий звонок")}
              {act.phase === "connecting" && "Соединяем…"}
              {act.phase === "active" && <span className="mono">{mmss(secs)}</span>}
              {act.phase === "ended" && (act.note ?? "Звонок завершён")}
            </span>
            {act.phase !== "ended" && (
              <div className="call-actions">
                {act.phase === "ringing-in" ? (
                  <>
                    <button type="button" className="call-btn hang" onClick={decline} aria-label="Отклонить">✕</button>
                    <button type="button" className="call-btn take" onClick={accept} aria-label="Ответить">✆</button>
                  </>
                ) : (
                  <>
                    <button type="button" className={`call-btn ${muted ? "off" : ""}`} onClick={toggleMute} aria-pressed={muted} title={muted ? "Включить микрофон" : "Выключить микрофон"}>
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />{muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}</svg>
                      <small>{muted ? "Микрофон выкл" : "Микрофон"}</small>
                    </button>
                    {act.call.video && (
                      <button type="button" className={`call-btn ${camOff ? "off" : ""}`} onClick={toggleCam} aria-pressed={camOff} title={camOff ? "Включить камеру" : "Выключить камеру"}>
                        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="7" width="12" height="10" rx="2" fill="currentColor" /><path d="M15 11l6-3v8l-6-3z" fill="currentColor" />{camOff && <path d="M3 4l17 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}</svg>
                        <small>{camOff ? "Камера выкл" : "Камера"}</small>
                      </button>
                    )}
                    {canShare && act.phase === "active" && (
                      <button type="button" className={`call-btn ${sharing ? "on" : ""}`} onClick={toggleShare} aria-pressed={sharing} title={sharing ? "Остановить показ экрана" : "Показать экран"}>
                        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <small>{sharing ? "Показываю" : "Экран"}</small>
                      </button>
                    )}
                    <button type="button" className="call-btn hang" onClick={hangup} title="Завершить">
                      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V15l-3 1.5z" fill="currentColor" /></svg>
                      <small>Завершить</small>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
