"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { loginWithToken, tg, tgAuth, tgInitData } from "@/lib/telegram";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";
import { savedRef } from "./RefCatcher";

const flag = (k: string) => { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } };
const setFlag = (k: string) => { try { sessionStorage.setItem(k, "1"); } catch {} };

/** Вход через Telegram: привязанный аккаунт входит сам, новичку — короткая регистрация, вошедшему — привязка Telegram */
export function TgAuth({ ready }: { ready: boolean }) {
  const { ready: sessReady, me } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [sheet, setSheet] = useState<null | { first: string; username: string }>(null);
  const [note, setNote] = useState("");
  const busy = useRef(false);

  async function tryLogin(manual = false) {
    if (busy.current || !tgInitData()) return;
    busy.current = true;
    setFlag("tg:tried");
    const r = await tgAuth("login");
    busy.current = false;
    if (r.status === "ok" && r.token) {
      if (await loginWithToken(r.token)) { tg()?.HapticFeedback?.notificationOccurred?.("success"); router.replace("/"); }
      else if (manual) setNote("Не получилось войти. Открой Relic заново из бота.");
    } else if (r.status === "new") {
      setSheet({ first: r.first_name ?? "", username: r.username ?? "" });
    } else if (manual && r.error) setNote(r.error);
  }

  // Не вошёл — пробуем войти через Telegram один раз за открытие
  useEffect(() => {
    if (!ready || !sessReady || me || flag("tg:tried")) return;
    tryLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessReady, me]);

  // Кнопка «Войти через Telegram» на странице входа
  useEffect(() => {
    const on = () => tryLogin(true);
    window.addEventListener("tg:login", on);
    return () => window.removeEventListener("tg:login", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Вошёл — привязываем Telegram к аккаунту (один раз за открытие), чтобы дальше входить в одно касание и получать уведомления
  useEffect(() => {
    if (!ready || !me || flag("tg:linked") || !tgInitData()) return;
    setFlag("tg:linked");
    setSheet(null);
    tgAuth("link").then((r) => {
      if (r.status === "linked") setNote("Telegram привязан: теперь вход в одно касание, а уведомления придут в бота.");
      if (r.status === "linked" || r.status === "same") {
        const w = tg();
        if (w?.initDataUnsafe?.user?.allows_write_to_pm === false) w.requestWriteAccess?.((ok) => { if (ok) tgAuth("link"); });
      }
    });
  }, [ready, me]);

  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 6000); return () => clearTimeout(t); }, [note]);

  return (
    <>
      {sheet && !me && path !== "/login" && path !== "/register" && <TgWelcome first={sheet.first} username={sheet.username} onClose={() => setSheet(null)} />}
      {note && <div className="login-alert tg-note" role="status"><span><b>Telegram</b><small>{note}</small></span><button type="button" className="btn sm ghost" onClick={() => setNote("")}>Ок</button></div>}
    </>
  );
}

function TgWelcome({ first, username, onClose }: { first: string; username: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(first);
  const [nick, setNick] = useState(username);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const u = normalizeUsername(nick);
    const bad = validateUsername(u);
    if (bad) return setErr(bad);
    setPending(true); setErr("");
    const r = await tgAuth("signup", { username: u, display_name: name.trim(), ref: savedRef() ?? "" });
    if (r.status === "ok" && r.token && (await loginWithToken(r.token))) {
      tg()?.HapticFeedback?.notificationOccurred?.("success");
      onClose();
      router.replace("/");
      return;
    }
    setPending(false);
    setErr(r.error ?? "Не получилось. Попробуй ещё раз.");
  }

  return (
    <div className="ia-shade tg-shade" onClick={onClose}>
      <form className="ia-sheet tg-sheet" onSubmit={create} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Вход в Relic">
        <span className="relic-logo tg-logo">relic<i aria-hidden="true" /></span>
        <h2>Привет{first ? `, ${first}` : ""}!</h2>
        <p>Создай аккаунт в одно касание — пароль не нужен, входить будешь через Telegram.</p>
        <label className="field">
          <span>Имя</span>
          <div className="input"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Как тебя зовут" /></div>
        </label>
        <label className="field">
          <span>Юзернейм</span>
          <div className={`input ${err ? "err" : ""}`}><input value={nick} onChange={(e) => { setNick(e.target.value); setErr(""); }} maxLength={USERNAME_MAX} autoCapitalize="none" spellCheck={false} placeholder="например, ivan.design" /></div>
          <span className="hint bad">{err}</span>
        </label>
        <button className="btn tg-go" type="submit" disabled={pending || !nick.trim()}>{pending ? "Создаю…" : "Создать аккаунт"}</button>
        <Link className="btn ghost tg-go" href="/login" onClick={onClose}>У меня уже есть аккаунт</Link>
        <small className="hint">Войдёшь в свой аккаунт — Telegram привяжется к нему сам.</small>
      </form>
    </div>
  );
}
