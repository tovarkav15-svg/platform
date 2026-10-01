"use client";

import { useState } from "react";
import { ACCENTS, accentColor } from "@/lib/style";
import { compressImage } from "@/lib/upload";
import { ChatAvatar } from "./ChatAvatar";

export type ChatLook = { title: string; description: string; emoji: string; accent: string; avatar: string | null; is_public: boolean };

const EMOJIS = ["🔥", "🚀", "🎬", "💡", "🧠", "💸", "🎧", "📈", "🛠", "🎯", "✨", "👕", "📣", "🤝", "🏆", "☕"];

async function toDataUrl(file: File) {
  const blob = await compressImage(file, 256, 0.85);
  return new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
}

/** Оформление группы или канала: название, описание, аватар, эмодзи, цвет — с живым превью */
export function ChatLookForm({ kind, value, onChange }: { kind: "group" | "channel"; value: ChatLook; onChange: (v: ChatLook) => void }) {
  const [err, setErr] = useState("");
  const set = (p: Partial<ChatLook>) => onChange({ ...value, ...p });
  return (
    <div className="chat-look">
      <div className="chat-look-preview" style={{ "--c": accentColor(value.accent) } as React.CSSProperties}>
        <ChatAvatar size={72} c={{ kind, avatar: value.avatar, accent: value.accent, emoji: value.emoji, title: value.title, other_id: null, other_name: null, other_avatar: null, other_accent: null }} />
        <span><b>{value.title || (kind === "channel" ? "Название канала" : "Название группы")}</b><small>{value.description || (kind === "channel" ? "Канал · подписчики читают" : "Группа · пишут все")}</small></span>
      </div>
      <label className="field">
        <span>Название</span>
        <div className="input"><input value={value.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={kind === "channel" ? "Монтаж: разборы и фишки" : "Команда запуска"} /></div>
      </label>
      <label className="field">
        <span>Описание <span className="count">{value.description.length}/300</span></span>
        <div className="input"><textarea rows={2} maxLength={300} value={value.description} onChange={(e) => set({ description: e.target.value })} placeholder="О чём здесь пишут" /></div>
      </label>
      <div className="field">
        <span>Аватар</span>
        <div className="avatar-row">
          <label className="btn ghost sm">Загрузить фото<input type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            try { set({ avatar: await toDataUrl(f) }); setErr(""); } catch { setErr("Не получилось открыть картинку"); }
          }} /></label>
          {value.avatar && <button type="button" className="btn ghost sm" onClick={() => set({ avatar: null })}>Убрать фото</button>}
        </div>
        {err && <span className="hint bad">{err}</span>}
      </div>
      <fieldset className="field plain">
        <span>Эмодзи <span className="count">если нет фото</span></span>
        <div className="emoji-pick">
          <button type="button" className={!value.emoji ? "on" : ""} onClick={() => set({ emoji: "" })}>Аа</button>
          {EMOJIS.map((e) => <button key={e} type="button" className={value.emoji === e ? "on" : ""} onClick={() => set({ emoji: e })}>{e}</button>)}
        </div>
      </fieldset>
      <fieldset className="field plain">
        <span>Цвет</span>
        <div className="swatches">
          {Object.entries(ACCENTS).map(([id, a]) => (
            <label key={id} className="swatch" title={a.title} style={{ "--c": a.color } as React.CSSProperties}>
              <input type="radio" name="chatAccent" checked={value.accent === id} onChange={() => set({ accent: id })} aria-label={a.title} />
              <span />
            </label>
          ))}
        </div>
      </fieldset>
      {kind === "channel" && (
        <label className="toggle light">
          <input type="checkbox" checked={value.is_public} onChange={(e) => set({ is_public: e.target.checked })} />
          <span className="knob" />
          <span>{value.is_public ? "Открытый: канал найдут в поиске каналов" : "Закрытый: только по приглашению"}</span>
        </label>
      )}
    </div>
  );
}
