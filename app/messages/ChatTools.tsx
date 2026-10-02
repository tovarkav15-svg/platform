"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal } from "../Modal";
import { FileMedia, ImageMedia, VideoMedia, VoiceMedia, type MediaMeta } from "./ChatMedia";

type MediaMsg = { id: string; kind: string; media_path: string | null; media_meta: MediaMeta; text: string; created_at: string; sender_id: string };
const TABS = [
  { id: "visual", label: "Фото и видео", kinds: ["image", "video"] },
  { id: "file", label: "Файлы", kinds: ["file"] },
  { id: "voice", label: "Голосовые", kinds: ["voice"] },
] as const;

/** Медиатека чата: всё, что присылали, по разделам */
export function MediaLibrary({ chatId, open, onClose, meId }: { chatId: string; open: boolean; onClose: () => void; meId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("visual");
  const [items, setItems] = useState<MediaMsg[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setItems(null);
    supabase.from("messages").select("id, kind, media_path, media_meta, text, created_at, sender_id").eq("chat_id", chatId)
      .in("kind", ["image", "video", "file", "voice"]).is("deleted_at", null).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setItems((data as MediaMsg[]) ?? []));
  }, [open, chatId]);
  const cur = TABS.find((t) => t.id === tab)!;
  const list = (items ?? []).filter((m) => (cur.kinds as readonly string[]).includes(m.kind));
  const count = (k: (typeof TABS)[number]) => (items ?? []).filter((m) => (k.kinds as readonly string[]).includes(m.kind)).length;
  return (
    <Modal open={open} onClose={onClose} title={<>Медиатека</>}>
      <div className="ml">
        <nav className="seg small">
          {TABS.map((t) => <button key={t.id} type="button" className="seg-item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>{t.label}{items && <em className="count-plain">{count(t)}</em>}</button>)}
        </nav>
        {items === null ? <div className="skeleton list-skeleton" /> : list.length === 0 ? (
          <p className="ml-empty">{tab === "visual" ? "Фото и видео пока не присылали." : tab === "file" ? "Файлов пока нет." : "Голосовых пока нет."}</p>
        ) : tab === "visual" ? (
          <div className="ml-grid">
            {list.map((m) => <div key={m.id} className="ml-tile">{m.kind === "image" ? <ImageMedia path={m.media_path} meta={m.media_meta} /> : <VideoMedia path={m.media_path} meta={m.media_meta} />}</div>)}
          </div>
        ) : (
          <ul className="ml-list">
            {list.map((m) => (
              <li key={m.id}>
                {m.kind === "file" ? <FileMedia path={m.media_path} meta={m.media_meta} /> : <VoiceMedia path={m.media_path} meta={m.media_meta} mine={m.sender_id === meId} />}
                <small>{new Date(m.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

const REASONS = ["Спам", "Мошенничество", "Оскорбления", "Неприемлемый контент", "Выдаёт себя за другого", "Другое"];

/** Жалоба на человека или сообщение — уходит модераторам */
export function ReportDialog({ target, messageId, name, onClose }: { target: string | null; messageId?: string | null; name: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"" | "busy" | "done" | "error">("");
  useEffect(() => { if (target) { setReason(""); setDetails(""); setState(""); } }, [target]);
  async function send() {
    if (!target || !reason) return;
    setState("busy");
    const { error } = await supabase.from("reports").insert({ target_user: target, message_id: messageId ?? null, reason, details: details.trim() });
    setState(error ? "error" : "done");
  }
  return (
    <Modal open={!!target} onClose={onClose} title={<>Пожаловаться{messageId ? " на сообщение" : ""}</>}>
      {state === "done" ? (
        <div className="rp-done"><b>Жалоба отправлена</b><p>Модераторы посмотрят её и примут меры. Спасибо, что помогаешь держать Relic чистым.</p><button type="button" className="btn" onClick={onClose}>Закрыть</button></div>
      ) : (
        <div className="rp">
          <p className="rp-sub">Что не так с {messageId ? "этим сообщением" : name}?</p>
          <div className="rp-reasons">
            {REASONS.map((r) => <button key={r} type="button" className="chip-btn" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
          </div>
          <textarea className="bl-in" rows={3} maxLength={600} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Подробности (по желанию)" />
          {state === "error" && <span className="hint bad">Не получилось отправить. Попробуй ещё раз.</span>}
          <div className="save-row"><button type="button" className="btn danger" disabled={!reason || state === "busy"} onClick={send}>{state === "busy" ? "Отправляю…" : "Отправить жалобу"}</button></div>
        </div>
      )}
    </Modal>
  );
}
