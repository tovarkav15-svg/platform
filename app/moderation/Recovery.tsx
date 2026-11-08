"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { profileHref } from "@/lib/links";
import { deviceName } from "@/lib/device";

type Found = { user_id: string; username: string | null; display_name: string | null; email: string | null; telegram: string | null; registered: string | null; last_login: string | null; banned_until: string | null; deleted_at: string | null; matched: string };
type Event = { id: number; kind: string; old_value: string | null; new_value: string | null; moderator: string | null; note: string; created_at: string };

const KIND: Record<string, string> = {
  snapshot: "Данные на момент запуска базы", created: "Регистрация", username: "Сменил ник", display_name: "Сменил имя", telegram: "Сменил телеграм",
  email: "Сменилась почта", password: "Сменился пароль", login: "Вход в аккаунт", deleted: "Аккаунт удалён", recovery: "Восстановление и защита",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** Восстановление аккаунтов: поиск по старым никам и почтам, история аккаунта, возврат доступа */
export function Recovery() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [open, setOpen] = useState<Found | null>(null);
  const search = useCallback(async (s: string) => {
    if (s.trim().length < 2) return setFound(null);
    const { data, error } = await supabase.rpc("mod_account_lookup", { p_q: s });
    setFound(error ? [] : ((data as Found[]) ?? []));
  }, []);
  useEffect(() => { const t = setTimeout(() => search(q), 350); return () => clearTimeout(t); }, [q, search]);

  if (open) return <Account a={open} onBack={() => setOpen(null)} />;
  return (
    <section className="md-section">
      <div className="rc-how">
        <b>Как вернуть аккаунт</b>
        <ol>
          <li>Найди аккаунт по тому, что помнит человек: старый или нынешний ник, почта (в том числе запасная), телеграм, имя. Удалённые аккаунты тоже ищутся.</li>
          <li>Проверь, что это его аккаунт. Лучше всего — код восстановления: попроси назвать один и нажми «Проверить код». Если кодов нет — спроси дату регистрации, прошлые ники, с какого устройства заходил, что было в профиле, и сверь с историей.</li>
          <li>Если почта его — отправь ссылку для нового пароля. Если почту угнали или потеряли — замени её на новую почту человека: всех выкинет со всех устройств, а ссылка для пароля придёт на новую почту.</li>
        </ol>
      </div>
      <div className="pp-input"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ник, старый ник, почта, телеграм или имя" aria-label="Поиск аккаунта" /></div>
      {found && (found.length === 0 ? <p className="md-empty">Ничего не нашлось.</p> : (
        <ul className="md-list">
          {found.map((f) => (
            <li key={f.user_id} className={`md-user ${f.deleted_at ? "is-banned" : ""}`}>
              <span className="md-who"><span><b>{f.display_name || f.username || "Без имени"}</b><small>@{f.username ?? "—"} · {f.email ?? "без почты"}</small></span></span>
              <span className="md-ban-info">{f.deleted_at ? `удалён ${when(f.deleted_at)}` : `вход: ${when(f.last_login)}`} · нашёлся по: {f.matched}</span>
              <button type="button" className="chip-btn" onClick={() => setOpen(f)}>Открыть</button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

function Account({ a, onBack }: { a: Found; onBack: () => void }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<{ backup_email: string | null; codes_left: number; codes_at: string | null; devices: number } | null>(null);
  const [code, setCode] = useState("");
  const load = useCallback(async () => {
    const [h, r] = await Promise.all([supabase.rpc("mod_account_history", { p_user: a.user_id }), supabase.rpc("mod_recovery_info", { p_user: a.user_id })]);
    setEvents((h.data as Event[]) ?? []);
    setInfo(((r.data as typeof info[]) ?? [])[0] ?? null);
  }, [a.user_id]);
  async function checkCode() {
    setBusy(true); setMsg("");
    const { data, error } = await supabase.rpc("mod_check_recovery_code", { p_user: a.user_id, p_code: code });
    setBusy(false);
    setMsg(error ? "Не получилось проверить" : data ? "✓ Код верный — аккаунт его. Код сгорел." : "✗ Код неверный");
    if (!error) { setCode(""); load(); }
  }
  useEffect(() => { load(); }, [load]);

  async function act(action: "reset" | "set_email" | "end_sessions", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMsg("");
    let err: string | null = null;
    if (action === "end_sessions") {
      const { error } = await supabase.rpc("mod_end_sessions", { p_user: a.user_id, p_note: note });
      err = error?.message ?? null;
    } else {
      const { data, error } = await supabase.functions.invoke("account-recovery", { body: { action, user_id: a.user_id, email, note } });
      // Сервер отвечает понятной причиной даже при ошибке — достаём её из ответа
      const why = error ? await (error as { context?: Response }).context?.json?.().catch(() => null) : null;
      err = (data as { error?: string } | null)?.error ?? (error ? why?.error ?? "Не получилось. Попробуй ещё раз." : null);
    }
    setBusy(false);
    setMsg(err ?? (action === "reset" ? "Письмо отправлено на почту аккаунта" : action === "set_email" ? "Почта заменена, письмо ушло на новую почту" : "Аккаунт отключён на всех устройствах"));
    if (!err) { setEmail(""); load(); }
  }

  const deleted = !!a.deleted_at;
  return (
    <section className="md-section">
      <button type="button" className="chip-btn" onClick={onBack}>← К поиску</button>
      <div className="rc-card">
        <div className="rc-who">
          <b>{a.display_name || a.username}</b>
          {a.username && !deleted ? <Link href={profileHref(a.username)}>@{a.username}</Link> : <span>@{a.username ?? "—"}</span>}
          {deleted && <em className="rc-deleted">удалён {when(a.deleted_at)}</em>}
        </div>
        <dl className="rc-facts">
          <dt>Почта</dt><dd>{a.email ?? "—"}</dd>
          <dt>Телеграм</dt><dd>{a.telegram ? `@${a.telegram}` : "—"}</dd>
          <dt>Регистрация</dt><dd>{when(a.registered)}</dd>
          <dt>Последний вход</dt><dd>{when(a.last_login)}</dd>
          <dt>Запасная почта</dt><dd>{info?.backup_email ?? "не указана"}</dd>
          <dt>Коды восстановления</dt><dd>{info?.codes_left ? `осталось ${info.codes_left} · созданы ${when(info.codes_at)}` : "не созданы"}</dd>
          <dt>Устройств сейчас</dt><dd>{info?.devices ?? "—"}</dd>
          <dt>ID</dt><dd className="rc-id">{a.user_id}</dd>
        </dl>
      </div>

      {deleted ? (
        <p className="md-empty">Аккаунт удалён. Данные сохранены в архиве: по ним можно подтвердить, что это был человек, и помочь завести новый аккаунт.</p>
      ) : (
        <div className="rc-actions">
          <input className="rc-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка: кто обратился и как подтвердил (необязательно)" maxLength={300} />
          <div className="rc-row">
            <button type="button" className="chip-btn" disabled={busy || !a.email} onClick={() => act("reset", `Отправить ссылку для нового пароля на ${a.email}?`)}>Ссылка для пароля на почту аккаунта</button>
            <button type="button" className="chip-btn md-danger" disabled={busy} onClick={() => act("end_sessions", "Выкинуть аккаунт со всех устройств? Владельцу придётся войти заново.")}>Выйти на всех устройствах</button>
          </div>
          {!!info?.codes_left && (
            <div className="rc-row">
              <input className="rc-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код восстановления, который назвал человек" />
              <button type="button" className="chip-btn" disabled={busy || code.trim().length < 8} onClick={checkCode}>Проверить код</button>
            </div>
          )}
          <div className="rc-row">
            <input className="rc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Новая почта человека" />
            {info?.backup_email && email !== info.backup_email && <button type="button" className="chip-btn" onClick={() => setEmail(info.backup_email!)}>Взять запасную</button>}
            <button type="button" className="chip-btn md-danger" disabled={busy || !email.includes("@")} onClick={() => act("set_email", `Заменить почту аккаунта на ${email}? Все устройства отключатся, ссылка для пароля придёт на новую почту.`)}>Заменить почту</button>
          </div>
          {msg && <p className="rc-msg" role="status">{msg}</p>}
        </div>
      )}

      <h3 className="rc-h">История аккаунта</h3>
      {events === null ? <div className="skeleton list-skeleton" /> : events.length === 0 ? <p className="md-empty">История пуста.</p> : (
        <ul className="md-list md-log">
          {events.map((e) => (
            <li key={e.id}>
              <b>{KIND[e.kind] ?? e.kind}</b>
              {e.kind === "login" && e.new_value ? <span className="md-note"> · {deviceName(e.new_value)}</span> : (e.old_value || e.new_value) && <span className="md-note"> · {e.old_value && <s>{e.old_value}</s>}{e.old_value && e.new_value && " → "}{e.new_value}</span>}
              {e.moderator && <span className="md-note"> · модератор</span>}
              {e.note && <span className="md-note"> · {e.note}</span>}
              <small>{when(e.created_at)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
