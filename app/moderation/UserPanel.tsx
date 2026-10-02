"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, publicMedia, type Profile } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { Modal } from "../Modal";
import { Avatar } from "../Avatar";

type Item = { id: string; title: string; sub?: string };
const FIELDS: { id: string; label: string; get: (p: Profile) => string | null }[] = [
  { id: "avatar", label: "Аватар", get: (p) => (p.avatar ? "фото" : null) },
  { id: "banner", label: "Баннер", get: (p) => (p.banner_path ? "своё фото или видео" : null) },
  { id: "name", label: "Имя", get: (p) => (p.display_name !== p.username ? p.display_name : null) },
  { id: "bio", label: "Био", get: (p) => p.bio || null },
  { id: "about", label: "О себе", get: (p) => p.about || null },
  { id: "headline", label: "Заголовок и статус", get: (p) => [p.headline, p.status].filter(Boolean).join(" · ") || null },
  { id: "looking_for", label: "Ищу", get: (p) => p.looking_for || null },
  { id: "skills", label: "Навыки", get: (p) => p.skills || null },
  { id: "links", label: "Ссылки", get: (p) => [p.telegram && `t.me/${p.telegram}`, p.website].filter(Boolean).join(" · ") || null },
  { id: "city", label: "Город", get: (p) => p.city || null },
  { id: "deco", label: "Декор из AURA Shop", get: () => "надетые предметы" },
];

/** Всё, что создал пользователь, с кнопками удаления — только для модераторов */
export function UserPanel({ username, onClose }: { username: string | null; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [lists, setLists] = useState<Record<string, Item[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    const { data: prof } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
    setP(prof as Profile | null);
    if (!prof) return;
    const [w, pr, j, rv, ch] = await Promise.all([
      supabase.from("works").select("id, title, result").eq("user_id", prof.id),
      supabase.from("projects").select("id, name, tagline").eq("user_id", prof.id),
      supabase.from("jobs").select("id, service, mod_status").eq("user_id", prof.id),
      supabase.from("reviews").select("id, rating, text").eq("author_id", prof.id),
      supabase.rpc("user_channels", { p_user: prof.id }),
    ]);
    setLists({
      work: (w.data ?? []).map((x) => ({ id: x.id, title: x.title, sub: x.result })),
      project: (pr.data ?? []).map((x) => ({ id: x.id, title: x.name, sub: x.tagline })),
      job: (j.data ?? []).map((x) => ({ id: x.id, title: x.service, sub: x.mod_status })),
      review: (rv.data ?? []).map((x) => ({ id: x.id, title: "★".repeat(x.rating), sub: x.text })),
      chat: ((ch.data as { chat_id: string; title: string; member_count: number }[]) ?? []).map((x) => ({ id: x.chat_id, title: x.title, sub: `${x.member_count} подписчиков` })),
    });
  }, [username]);
  useEffect(() => { setP(null); setLists({}); load(); }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) window.alert(error.message); else load();
  }

  const SECTIONS: [string, string][] = [["work", "Proof of Work"], ["project", "Проекты"], ["job", "Бейджи биржи"], ["review", "Отзывы, которые он написал"], ["chat", "Его каналы"]];

  return (
    <Modal open={!!username} onClose={onClose} title={<>Управление пользователем</>}>
      {!p ? <div className="skeleton list-skeleton" /> : (
        <div className="up">
          <div className="up-head">
            <Avatar name={p.display_name} avatar={p.avatar} accent={p.accent} size={56} />
            <span><b>{p.display_name}</b><Link href={profileHref(p.username)}>@{p.username} ↗</Link></span>
          </div>
          {publicMedia(p.banner_path) && !/\.(mp4|webm)$/i.test(p.banner_path ?? "") && <img className="up-banner" src={publicMedia(p.banner_path)!} alt="" />}

          <section>
            <h4>Профиль</h4>
            <ul className="up-list">
              {FIELDS.map((f) => {
                const v = f.get(p);
                if (!v) return null;
                return (
                  <li key={f.id}>
                    <span><b>{f.label}</b><small>{v.length > 160 ? v.slice(0, 160) + "…" : v}</small></span>
                    <button type="button" className="chip-btn md-danger" disabled={busy} onClick={() => run(() => supabase.rpc("mod_clear_profile", { p_user: p.id, p_fields: [f.id] }))}>Очистить</button>
                  </li>
                );
              })}
            </ul>
          </section>

          {SECTIONS.map(([kind, title]) => (lists[kind]?.length ? (
            <section key={kind}>
              <h4>{title} · {lists[kind].length}</h4>
              <ul className="up-list">
                {lists[kind].map((it) => (
                  <li key={it.id}>
                    <span><b>{it.title || "Без названия"}</b>{it.sub && <small>{it.sub}</small>}</span>
                    <button type="button" className="chip-btn md-danger" disabled={busy} onClick={() => run(() => supabase.rpc("mod_delete", { p_kind: kind, p_id: it.id }), `Удалить «${it.title}»?`)}>Удалить</button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null))}

          <section className="up-danger">
            <h4>Стереть всё</h4>
            <p>Удалит работы, проекты, бейджи, отзывы, каналы и группы, очистит профиль и пометит все его сообщения удалёнными. Отменить нельзя.</p>
            <button type="button" className="btn danger" disabled={busy} onClick={() => run(() => supabase.rpc("mod_wipe_user", { p_user: p.id }), `Стереть весь контент @${p.username}? Это нельзя отменить.`)}>Стереть весь контент</button>
          </section>
        </div>
      )}
    </Modal>
  );
}
