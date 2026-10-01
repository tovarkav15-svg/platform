"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, type ChatListItem } from "@/lib/supabase";
import { BANNERS } from "@/lib/banners";
import { accentColor } from "@/lib/style";
import { Avatar } from "../Avatar";
import { Banner } from "../ProfileHeader";

type Invite = { code: string; mode: "join" | "request"; uses: number; max_uses: number | null; expires_at: string | null; revoked: boolean; created_at: string };
type Req = { user_id: string; username: string; display_name: string; avatar: string | null; accent: string; created_at: string };
type Extra = { username: string | null; join_mode: "open" | "request" | "invite"; banner_preset: string; sign_posts: boolean; is_public: boolean };

const base = () => (typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname.startsWith("/platform") ? "/platform" : ""}` : "");
export const inviteUrl = (code: string) => `${base()}/join/?code=${code}`;
export const channelUrl = (u: string) => `${base()}/c/?u=${u}`;

async function copy(text: string, done: () => void) {
  try { await navigator.clipboard.writeText(text); done(); } catch { window.prompt("Скопируй ссылку", text); }
}

/** Доступ к группе или каналу: юзернейм, режим входа, ссылки-приглашения, заявки, баннер канала */
export function ChatAccess({ chat, onChanged }: { chat: ChatListItem; onChanged: () => void }) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const [uname, setUname] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const [{ data: c }, { data: inv }, { data: rq }] = await Promise.all([
      supabase.from("chats").select("username, join_mode, banner_preset, sign_posts, is_public").eq("id", chat.chat_id).single(),
      supabase.from("chat_invites").select("*").eq("chat_id", chat.chat_id).eq("revoked", false).order("created_at", { ascending: false }),
      supabase.rpc("chat_requests", { p_chat: chat.chat_id }),
    ]);
    if (c) { setExtra(c as Extra); setUname(c.username ?? ""); }
    setInvites((inv as Invite[]) ?? []);
    setReqs((rq as Req[]) ?? []);
  }, [chat.chat_id]);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  async function patch(p: Partial<Extra>) {
    const { error } = await supabase.from("chats").update(p).eq("id", chat.chat_id);
    if (error) flash(error.message.includes("duplicate") || error.code === "23505" ? "Этот юзернейм уже занят" : error.message.includes("check") ? "Юзернейм: 4–32 символа, латиница, цифры и _" : "Не получилось сохранить");
    else { flash("Сохранено"); setExtra((e) => (e ? { ...e, ...p } : e)); onChanged(); }
  }

  async function newInvite(mode: "join" | "request") {
    await supabase.from("chat_invites").insert({ chat_id: chat.chat_id, mode });
    load();
  }

  if (!extra) return <div className="skeleton list-skeleton" />;
  const isChannel = chat.kind === "channel";

  return (
    <>
      <section className="cs-block">
        <div className="label">Публичная ссылка</div>
        <div className="uname-row">
          <div className="input"><span className="at">@</span><input value={uname} maxLength={32} placeholder={isChannel ? "montazh_daily" : "team_launch"}
            onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} aria-label="Юзернейм" /></div>
          <button type="button" className="btn sm" onClick={() => patch({ username: uname || null })}>Сохранить</button>
        </div>
        {extra.username && (
          <div className="link-box">
            <span className="mono">{channelUrl(extra.username).replace(/^https?:\/\//, "")}</span>
            <button type="button" className="chip-btn" onClick={() => copy(channelUrl(extra.username!), () => { setCopied("u"); setTimeout(() => setCopied(""), 1500); })}>{copied === "u" ? "Скопировано" : "Копировать"}</button>
          </div>
        )}
        <fieldset className="field plain">
          <span>Как вступить</span>
          <div className="seg small">
            {([["open", isChannel ? "Открытый" : "Свободный вход"], ["request", "По заявкам"], ["invite", "Только по приглашению"]] as const).map(([v, l]) => (
              <button key={v} type="button" className="seg-item" aria-current={extra.join_mode === v || (v === "open" && isChannel && extra.is_public && extra.join_mode !== "request") ? "page" : undefined}
                onClick={() => patch({ join_mode: v, ...(isChannel ? { is_public: v === "open" } : {}) })}>{l}</button>
            ))}
          </div>
          <span className="hint">
            {extra.join_mode === "open" || (isChannel && extra.is_public) ? "Любой по ссылке или юзернейму вступает сразу." : extra.join_mode === "request" ? "По юзернейму подают заявку, ты одобряешь." : "Зайти можно только по пригласительной ссылке."}
          </span>
        </fieldset>
        {msg && <span className={`hint ${msg === "Сохранено" ? "good" : "bad"}`}>{msg}</span>}
      </section>

      <section className="cs-block">
        <div className="row-between"><div className="label">Пригласительные ссылки</div>
          <span className="friend-actions">
            <button type="button" className="chip-btn" onClick={() => newInvite("join")}>+ Вход сразу</button>
            <button type="button" className="chip-btn" onClick={() => newInvite("request")}>+ По заявке</button>
          </span>
        </div>
        {invites.length ? (
          <ul className="invites">
            {invites.map((v) => (
              <li key={v.code}>
                <span className={`inv-mode ${v.mode}`}>{v.mode === "join" ? "сразу" : "заявка"}</span>
                <span className="mono inv-code">…/join/?code={v.code}</span>
                <span className="inv-uses">{v.uses} {v.uses === 1 ? "вход" : "входов"}</span>
                <button type="button" className="chip-btn" onClick={() => copy(inviteUrl(v.code), () => { setCopied(v.code); setTimeout(() => setCopied(""), 1500); })}>{copied === v.code ? "Скопировано" : "Копировать"}</button>
                <button type="button" className="icon-btn sm" aria-label="Отключить ссылку" onClick={async () => { await supabase.from("chat_invites").update({ revoked: true }).eq("code", v.code); load(); }}>×</button>
              </li>
            ))}
          </ul>
        ) : <p className="hint">Создай ссылку и отправь её людям. Ссылку «по заявке» нужно будет одобрить.</p>}
      </section>

      {reqs.length > 0 && (
        <section className="cs-block">
          <div className="label">Заявки · {reqs.length}</div>
          <ul className="cs-members">
            {reqs.map((r) => (
              <li key={r.user_id}>
                <span className="cs-person"><Avatar name={r.display_name} avatar={r.avatar} accent={r.accent} size={34} userId={r.user_id} /><span><b>{r.display_name}</b><small>@{r.username}</small></span></span>
                <button type="button" className="chip-btn go" onClick={async () => { await supabase.rpc("review_request", { p_chat: chat.chat_id, p_user: r.user_id, p_approve: true }); load(); onChanged(); }}>Принять</button>
                <button type="button" className="chip-btn" onClick={async () => { await supabase.rpc("review_request", { p_chat: chat.chat_id, p_user: r.user_id, p_approve: false }); load(); }}>Отклонить</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isChannel && (
        <section className="cs-block">
          <div className="label">Оформление канала</div>
          <div className="banner-picks" style={{ "--c": accentColor(chat.accent) } as React.CSSProperties}>
            {BANNERS.map((b) => (
              <button key={b.id} type="button" className={`banner-pick ${extra.banner_preset === b.id ? "on" : ""}`} onClick={() => patch({ banner_preset: b.id })}>
                <Banner preset={b.id} className="mini" /><b>{b.title}</b>
              </button>
            ))}
          </div>
          <label className="toggle light">
            <input type="checkbox" checked={extra.sign_posts} onChange={(e) => patch({ sign_posts: e.target.checked })} />
            <span className="knob" />
            <span>{extra.sign_posts ? "Под постами видно, кто из админов написал" : "Посты от имени канала, без подписи"}</span>
          </label>
        </section>
      )}
    </>
  );
}
