"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AuthSide } from "../AuthSide";

/** Сюда ведёт ссылка из письма «Сменить пароль»: Supabase сам поднимает сессию из ссылки */
export default function ResetPage() {
  const router = useRouter();
  const [state, setState] = useState<"wait" | "ready" | "bad" | "done">("wait");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = "Новый пароль";
    const hashErr = new URLSearchParams(window.location.hash.slice(1)).get("error_description") ?? new URLSearchParams(window.location.search).get("error_description");
    if (hashErr) return setState("bad");
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (session && (ev === "PASSWORD_RECOVERY" || ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) setState((s) => (s === "wait" ? "ready" : s));
    });
    // Если за несколько секунд сессия не появилась — ссылка устарела или уже использована
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setState((s) => (s === "wait" ? (data.session ? "ready" : "bad") : s));
    }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (pass.length < 8) return setError("Минимум 8 символов");
    if (!/\d/.test(pass) || !/[a-zA-Zа-яА-Я]/.test(pass)) return setError("Нужны буквы и хотя бы одна цифра");
    if (pass !== pass2) return setError("Пароли не совпадают");
    setPending(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password: pass });
    setPending(false);
    if (error) return setError(/different|same/i.test(error.message) ? "Новый пароль должен отличаться от старого" : "Не получилось сменить пароль. Запроси ссылку ещё раз.");
    setState("done");
    setTimeout(() => router.replace("/"), 1800);
  }

  return (
    <div className="auth">
      <AuthSide title={<>Новый <span className="it">пароль</span></>} text="Пара секунд — и ты снова в деле." />
      <main className="auth-main">
        <form onSubmit={save} className="auth-form">
          <div className="label">Восстановление</div>
          <h1 className="caps">Задай <span className="it">новый</span> пароль</h1>
          {state === "wait" && <p className="auth-note">Проверяю ссылку…</p>}
          {state === "bad" && (
            <>
              <div className="form-error">Ссылка устарела или уже использована. Запроси новую — она действует один час.</div>
              <Link className="btn" href="/login">Запросить снова</Link>
            </>
          )}
          {state === "done" && <div className="form-ok"><b>Пароль изменён</b><span>Входим в аккаунт…</span></div>}
          {state === "ready" && (
            <>
              {error && <div className="form-error">{error}</div>}
              <label className="field" htmlFor="password">
                <span className="field-row">Новый пароль<button type="button" className="forgot" onClick={() => setShow(!show)}>{show ? "Скрыть" : "Показать"}</button></span>
                <div className="input"><input id="password" type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Минимум 8 символов, буквы и цифра" autoComplete="new-password" autoFocus required /></div>
              </label>
              <label className="field">
                <span>Повтори пароль</span>
                <div className="input"><input type={show ? "text" : "password"} value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" required /></div>
              </label>
              <button className="btn" type="submit" disabled={pending}>{pending ? "Сохраняю…" : "Сохранить пароль"}</button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
