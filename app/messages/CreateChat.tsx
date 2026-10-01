"use client";

import { useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { Modal } from "../Modal";
import { Avatar } from "../Avatar";
import { ChatLookForm, type ChatLook } from "./ChatForm";

/** Новая группа или канал: оформление и участники из друзей */
export function CreateChat({ kind, onClose, onCreated, meId }: { kind: "group" | "channel" | null; onClose: () => void; onCreated: (id: string) => void; meId: string }) {
  return (
    <Modal open={!!kind} onClose={onClose} title={kind === "channel" ? <>Новый <span className="it">канал</span></> : <>Новая <span className="it">группа</span></>}>
      {kind && <Form key={kind} kind={kind} meId={meId} onCreated={onCreated} />}
    </Modal>
  );
}

function Form({ kind, meId, onCreated }: { kind: "group" | "channel"; meId: string; onCreated: (id: string) => void }) {
  const [look, setLook] = useState<ChatLook>({ title: "", description: "", emoji: kind === "channel" ? "📣" : "🔥", accent: kind === "channel" ? "edit" : "ai", avatar: null, is_public: true });
  const [friends, setFriends] = useState<ProfileCard[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("friendships").select(`requester, r:profiles!friendships_requester_fkey(${PROFILE_CARD}), a:profiles!friendships_addressee_fkey(${PROFILE_CARD})`).eq("status", "accepted")
      .then(({ data }) => setFriends(((data as unknown as { requester: string; r: ProfileCard; a: ProfileCard }[]) ?? []).map((l) => (l.requester === meId ? l.a : l.r))));
  }, [meId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!look.title.trim()) return setErr("Дай название");
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("create_chat", {
      p_kind: kind, p_title: look.title.trim(), p_description: look.description.trim(), p_accent: look.accent,
      p_emoji: look.emoji, p_avatar: look.avatar, p_public: look.is_public, p_members: [...picked],
    });
    if (error || !data) { setBusy(false); return setErr("Не получилось создать. Попробуй ещё раз."); }
    onCreated(data as string);
  }

  return (
    <form className="editor" onSubmit={create}>
      <ChatLookForm kind={kind} value={look} onChange={setLook} />
      <fieldset className="field plain">
        <span>{kind === "channel" ? "Сразу подписать друзей" : "Участники"} <span className="count">{picked.size} выбрано</span></span>
        {friends.length ? (
          <div className="pick-people">
            {friends.map((f) => (
              <label key={f.id} className={`pick-person ${picked.has(f.id) ? "on" : ""}`}>
                <input type="checkbox" checked={picked.has(f.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; })} />
                <Avatar name={f.display_name} avatar={f.avatar} accent={f.accent} size={32} userId={f.id} />
                <span>{f.display_name}<small>@{f.username}</small></span>
              </label>
            ))}
          </div>
        ) : <p className="hint">Друзей пока нет: участников можно будет добавить позже в настройках {kind === "channel" ? "канала" : "группы"}.</p>}
      </fieldset>
      {err && <div className="form-error">{err}</div>}
      <div className="editor-actions"><button type="submit" className="btn" disabled={busy}>{busy ? "Создаю…" : kind === "channel" ? "Создать канал" : "Создать группу"}</button></div>
    </form>
  );
}
