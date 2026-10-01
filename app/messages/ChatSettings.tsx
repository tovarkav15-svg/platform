"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type ChatListItem, type ProfileCard } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { Modal } from "../Modal";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";
import { ChatLookForm, type ChatLook } from "./ChatForm";
import { KIND_NAME } from "./ChatAvatar";
import { ChatAccess } from "./ChatAccess";

export type Member = { user_id: string; role: "owner" | "admin" | "member"; username: string; display_name: string; avatar: string | null; accent: string; user_role: string; is_support?: boolean };
const ROLE_NAME = { owner: "Владелец", admin: "Админ", member: "Участник" } as const;

export function ChatSettings({ chat, open, meId, onClose, onChanged, onLeft }: {
  chat: ChatListItem; open: boolean; meId: string; onClose: () => void; onChanged: () => void; onLeft: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={<>{KIND_NAME[chat.kind]} · <span className="it">настройки</span></>}>
      {open && <Body chat={chat} meId={meId} onChanged={onChanged} onLeft={onLeft} />}
    </Modal>
  );
}

function Body({ chat, meId, onChanged, onLeft }: { chat: ChatListItem; meId: string; onChanged: () => void; onLeft: () => void }) {
  const canEdit = (chat.kind === "group" || chat.kind === "channel") && (chat.my_role === "owner" || chat.my_role === "admin");
  const [look, setLook] = useState<ChatLook>({ title: chat.title, description: "", emoji: chat.emoji, accent: chat.accent, avatar: chat.avatar, is_public: chat.is_public });
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<ProfileCard[]>([]);
  const [msg, setMsg] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);

  const load = useCallback(async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.rpc("chat_people", { p_chat: chat.chat_id }),
      supabase.from("chats").select("description").eq("id", chat.chat_id).maybeSingle(),
    ]);
    setMembers((m as Member[]) ?? []);
    if (c) setLook((l) => ({ ...l, description: c.description ?? "" }));
  }, [chat.chat_id]);

  useEffect(() => {
    load();
    if (canEdit) {
      supabase.from("friendships").select(`requester, r:profiles!friendships_requester_fkey(${PROFILE_CARD}), a:profiles!friendships_addressee_fkey(${PROFILE_CARD})`).eq("status", "accepted")
        .then(({ data }) => setFriends(((data as unknown as { requester: string; r: ProfileCard; a: ProfileCard }[]) ?? []).map((l) => (l.requester === meId ? l.a : l.r))));
    }
  }, [load, canEdit, meId]);

  async function saveLook() {
    const { error } = await supabase.from("chats").update({
      title: look.title.trim() || chat.title, description: look.description.trim(), emoji: look.emoji, accent: look.accent, avatar: look.avatar, is_public: look.is_public,
    }).eq("id", chat.chat_id);
    setMsg(error ? "Не получилось сохранить" : "Сохранено");
    if (!error) onChanged();
    setTimeout(() => setMsg(""), 2000);
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = friends.filter((f) => !memberIds.has(f.id));

  return (
    <div className="editor chat-settings">
      {canEdit && (
        <section className="cs-block">
          <ChatLookForm kind={chat.kind as "group" | "channel"} value={look} onChange={setLook} />
          <div className="save-row"><button type="button" className="btn" onClick={saveLook}>Сохранить оформление</button>{msg && <span className="hint good">{msg}</span>}</div>
        </section>
      )}

      {canEdit && <ChatAccess chat={chat} onChanged={onChanged} />}

      <section className="cs-block">
        <div className="label">{chat.kind === "channel" ? "Подписчики" : "Участники"} · {members.length}</div>
        <ul className="cs-members">
          {members.map((m) => (
            <li key={m.user_id}>
              <Link href={profileHref(m.username)} className="cs-person">
                <Avatar name={m.display_name} avatar={m.avatar} accent={m.accent} size={36} userId={m.user_id} />
                <span><b>{m.display_name}<RoleBadge role={m.user_role} small support={m.is_support} /></b><small>@{m.username}</small></span>
              </Link>
              <span className={`cs-role r-${m.role}`}>{chat.kind === "support" && m.role === "admin" ? "Команда" : ROLE_NAME[m.role]}</span>
              {chat.my_role === "owner" && m.user_id !== meId && chat.kind !== "support" && (
                <button type="button" className="chip-btn" onClick={async () => { await supabase.rpc("set_member_role", { p_chat: chat.chat_id, p_user: m.user_id, p_role: m.role === "admin" ? "member" : "admin" }); load(); }}>
                  {m.role === "admin" ? "Снять админа" : "Сделать админом"}
                </button>
              )}
              {canEdit && m.role !== "owner" && m.user_id !== meId && (
                <button type="button" className="icon-btn sm" aria-label="Убрать из чата" onClick={async () => { await supabase.rpc("remove_member", { p_chat: chat.chat_id, p_user: m.user_id }); load(); onChanged(); }}>×</button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && candidates.length > 0 && (
          <div className="cs-add">
            <span className="label">Добавить из друзей</span>
            <div className="pick-people">
              {candidates.map((f) => (
                <button key={f.id} type="button" className="pick-person" onClick={async () => { await supabase.rpc("add_members", { p_chat: chat.chat_id, p_users: [f.id] }); load(); onChanged(); }}>
                  <Avatar name={f.display_name} avatar={f.avatar} accent={f.accent} size={28} />
                  <span>{f.display_name}<small>+ добавить</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {(chat.kind === "group" || chat.kind === "channel") && (
        <section className="cs-block cs-danger">
          {confirmLeave
            ? <button type="button" className="btn danger" onClick={async () => { await supabase.rpc("leave_chat", { p_chat: chat.chat_id }); onLeft(); }}>
                {chat.my_role === "owner" && members.length <= 1 ? "Удалить и выйти" : "Точно выйти"}
              </button>
            : <button type="button" className="btn ghost" onClick={() => setConfirmLeave(true)}>{chat.kind === "channel" ? "Отписаться" : "Выйти из группы"}</button>}
          {chat.my_role === "owner" && members.length > 1 && <span className="hint">Если выйдешь, владельцем станет следующий админ или участник.</span>}
        </section>
      )}
    </div>
  );
}
