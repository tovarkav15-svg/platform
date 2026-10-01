"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Avatar } from "../Avatar";

type CallRow = { id: string; chat_id: string; caller: string; callee: string; video: boolean; status: string; created_at: string };
type Phase = "ringing-out" | "ringing-in" | "connecting" | "active" | "ended";
type Active = { call: CallRow; peer: ProfileCard; phase: Phase; outgoing: boolean; note?: string };

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
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
    remoteStream.current = null;
    pendingIce.current = []; seen.current = new Set();
    if (channel.current) supabase.removeChannel(channel.current); channel.current = null;
    startedAt.current = null;
    setMuted(false); setCamOff(false); setSecs(0);
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
    p.onicecandidate = (e) => { if (e.candidate) send(call.id, { type: "ice", candidate: e.candidate.toJSON() }); };
    p.ontrack = (e) => {
      remoteStream.current = e.streams[0];
      if (remoteVideo.current) remoteVideo.current.srcObject = e.streams[0];
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
    return () => { supabase.removeChannel(ch); };
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
      for (const s of sigs ?? []) if (s.data.type === "ice" && s.sender !== me?.id) { seen.current.add(s.id); await p.addIceCandidate(s.data.candidate).catch(() => {}); }
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

  return (
    <Ctx.Provider value={{ startCall }}>
      {children}
      {act && (
        <div className={`call-layer ph-${act.phase} ${act.call.video ? "video" : "audio"}`} role="dialog" aria-label="Звонок">
          <div className="call-bg" aria-hidden="true"><i /><i /></div>
          {act.call.video && (act.phase === "active" || act.phase === "connecting") && (
            <>
              <video ref={remoteVideo} className="call-remote" autoPlay playsInline />
              <video ref={localVideo} className="call-local" autoPlay playsInline muted />
            </>
          )}
          {!act.call.video && <audio ref={remoteVideo as unknown as React.RefObject<HTMLAudioElement>} autoPlay />}
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
                    <button type="button" className={`call-btn ${muted ? "off" : ""}`} onClick={toggleMute} aria-label={muted ? "Включить микрофон" : "Выключить микрофон"}>{muted ? "🔇" : "🎙"}</button>
                    {act.call.video && <button type="button" className={`call-btn ${camOff ? "off" : ""}`} onClick={toggleCam} aria-label={camOff ? "Включить камеру" : "Выключить камеру"}>{camOff ? "🚫" : "📷"}</button>}
                    <button type="button" className="call-btn hang" onClick={hangup} aria-label="Завершить">✕</button>
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
