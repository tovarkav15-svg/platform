"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { deviceName } from "@/lib/device";

type Sess = { id: string; user_agent: string | null; ip: string | null; created_at: string; last_active: string; current: boolean };
type Rec = { backup_email: string | null; codes_left: number; codes_at: string | null };
type Ev = { kind: string; old_value: string | null; new_value: string | null; note: string; created_at: string };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const KIND: Record<string, string> = { login: "Вход", password: "Сменён пароль", email: "Сменена почта", username: "Сменён ник", recovery: "Восстановление", created: "Регистрация" };

/** Безопасность как в мессенджерах: устройства, запасная почта, коды восстановления, журнал входов */
export function SecurityPanel() {
  const [sessions, setSessions] = useState<Sess[] | null>(null);
  const [rec, setRec] = useState<Rec | null>(null);
  const [log, setLog] = useState<Ev[] | null>(null);
  const [email, setEmail] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ where: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const [s, r, l] = await Promise.all([supabase.rpc("my_sessions"), supabase.rpc("my_recovery"), supabase.rpc("my_security_log")]);
    setSessions((s.data as Sess[]) ?? []);
    const rr = ((r.data as Rec[]) ?? [])[0] ?? { backup_email: null, codes_left: 0, codes_at: null };
    setRec(rr); setEmail(rr.backup_email ?? "");
    setLog((l.data as Ev[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const say = (where: string, text: string) => setMsg({ where, text });

  async function endOne(id: string) {
    const { error } = await supabase.rpc("end_my_session", { p_id: id });
    if (error) return say("dev", "Не получилось. Попробуй ещё раз.");
    load();
  }
  async function endOthers() {
    if (!window.confirm("Выйти на всех других устройствах? Там придётся войти заново.")) return;
    const { data, error } = await supabase.rpc("end_other_sessions");
    say("dev", error ? "Не получилось. Попробуй ещё раз." : `Готово: закрыто сеансов — ${data ?? 0}`);
    load();
  }
  async function saveEmail() {
    const { error } = await supabase.rpc("set_backup_email", { p_email: email });
    say("mail", error ? (error.message.includes("Неверная") ? "Проверь почту: похоже, в ней ошибка" : "Не получилось сохранить") : email.trim() ? "Запасная почта сохранена" : "Запасная почта убрана");
    if (!error) load();
  }
  async function makeCodes() {
    if (rec?.codes_left && !window.confirm("Старые коды перестанут работать. Создать новые?")) return;
    const { data, error } = await supabase.rpc("new_recovery_codes");
    if (error) return say("codes", "Не получилось создать коды");
    setCodes(data as string[]);
    load();
  }

  const others = (sessions ?? []).filter((s) => !s.current);
  return (
    <>
      <div className="card sc-block">
        <h2 className="h-md">Устройства</h2>
        <p className="st-note">Где сейчас открыт твой аккаунт. Если видишь незнакомое устройство — закрой его и смени пароль.</p>
        {sessions === null ? <div className="skeleton list-skeleton" /> : (
          <ul className="sc-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span><b>{deviceName(s.user_agent)}{s.current && <em className="sc-here">это устройство</em>}</b>
                  <small>{s.ip ? `${s.ip} · ` : ""}вход {when(s.created_at)} · активен {when(s.last_active)}</small></span>
                {!s.current && <button type="button" className="chip-btn md-danger" onClick={() => endOne(s.id)}>Закрыть</button>}
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && <div className="save-row"><button type="button" className="btn ghost" onClick={endOthers}>Выйти на всех других устройствах</button></div>}
        {msg?.where === "dev" && <p className="hint">{msg.text}</p>}
      </div>

      <div className="card sc-block">
        <h2 className="h-md">Запасная почта</h2>
        <p className="st-note">Если потеряешь доступ к основной почте или аккаунт угонят, поддержка вернёт его на эту почту. Её видишь только ты и модераторы.</p>
        <div className="sc-row">
          <div className="input"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="другая@почта.ru" autoComplete="email" /></div>
          <button type="button" className="btn" disabled={rec === null || email.trim() === (rec?.backup_email ?? "")} onClick={saveEmail}>Сохранить</button>
        </div>
        {msg?.where === "mail" && <p className="hint">{msg.text}</p>}
      </div>

      <div className="card sc-block">
        <h2 className="h-md">Коды восстановления</h2>
        <p className="st-note">8 одноразовых кодов — как в Discord и Google. Сохрани их в заметки или запиши. Назовёшь один код поддержке — и мы точно поймём, что аккаунт твой.</p>
        {codes ? (
          <>
            <ol className="sc-codes">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
            <div className="save-row">
              <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(codes.join("\n")); say("codes", "Скопировано"); }}>Скопировать</button>
              <button type="button" className="link-btn" onClick={() => setCodes(null)}>Я сохранил коды</button>
            </div>
            <p className="hint">Коды показываются только сейчас. Потом их не увидит никто, даже мы.</p>
          </>
        ) : (
          <div className="save-row">
            <button type="button" className="btn ghost" disabled={rec === null} onClick={makeCodes}>{rec?.codes_left ? "Создать новые коды" : "Создать коды"}</button>
            {rec && rec.codes_left > 0 && <span className="hint">Осталось кодов: {rec.codes_left} · созданы {when(rec.codes_at)}</span>}
          </div>
        )}
        {msg?.where === "codes" && <p className="hint">{msg.text}</p>}
      </div>

      <div className="card sc-block">
        <h2 className="h-md">Недавние действия</h2>
        {log === null ? <div className="skeleton list-skeleton" /> : log.length === 0 ? <p className="st-note">Пока пусто.</p> : (
          <ul className="sc-list">
            {log.map((e, i) => (
              <li key={i}>
                <span><b>{KIND[e.kind] ?? e.kind}{e.kind === "login" ? ` · ${deviceName(e.new_value)}` : ""}</b>
                  <small>{e.kind === "login" ? e.note : e.kind === "username" ? `${e.old_value} → ${e.new_value}` : e.note || ""}{(e.kind === "login" ? e.note : e.note || e.kind === "username") ? " · " : ""}{when(e.created_at)}</small></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
