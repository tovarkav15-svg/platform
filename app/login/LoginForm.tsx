"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [login, setLogin] = useState("");
  const [sent, setSent] = useState("");

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    setPending(true);
    setError("");
    const { error } = await signIn(login, String(form.get("password") ?? ""));
    if (error) {
      setPending(false);
      return setError(error);
    }
    router.replace("/");
  }

  /** Письмо со ссылкой на смену пароля. Принимает и почту, и @юзернейм */
  async function sendReset(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const v = login.trim();
    if (!v) return setError("Введи почту или юзернейм");
    setPending(true);
    setError("");
    const email = v.includes("@") && !v.startsWith("@") ? v : ((await supabase.rpc("login_email", { p_username: v })).data as string | null);
    const redirectTo = `${window.location.origin}${process.env.NODE_ENV === "production" ? "/platform" : ""}/reset/`;
    if (email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        setPending(false);
        return setError(/rate|seconds|limit/i.test(error.message) ? "Письмо уже отправлено недавно. Подожди минуту и попробуй снова." : "Не получилось отправить письмо. Попробуй позже.");
      }
    }
    // Одинаковый ответ, есть такой аккаунт или нет, — чтобы нельзя было перебирать чужие почты
    setPending(false);
    setSent(email ? email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(b.length, 6)) + c) : v);
  }

  if (forgot) return (
    <form onSubmit={sendReset} className="auth-form">
      <div className="label">Восстановление</div>
      <h1 className="caps">Забыли <span className="it">пароль?</span></h1>
      {sent ? (
        <>
          <div className="form-ok">
            <b>Проверь почту</b>
            <span>Если аккаунт существует, мы отправили ссылку для смены пароля на <b>{sent}</b>. Письмо может прийти через пару минут — загляни и в «Спам».</span>
          </div>
          <button className="btn ghost" type="button" onClick={() => { setSent(""); }}>Отправить ещё раз</button>
        </>
      ) : (
        <>
          <p className="auth-note">Укажи почту или юзернейм — пришлём ссылку, по которой можно задать новый пароль.</p>
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span>Почта или юзернейм</span>
            <div className="input">
              <input id="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="you@mail.ru" autoComplete="username" autoCapitalize="none" autoFocus required />
            </div>
          </label>
          <button className="btn" type="submit" disabled={pending}>{pending ? "Отправляю…" : "Прислать ссылку"}</button>
        </>
      )}
      <p className="switch"><button type="button" className="link-btn" onClick={() => { setForgot(false); setError(""); setSent(""); }}>← Вернуться ко входу</button></p>
    </form>
  );

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="label">Вход</div>
      <h1 className="caps">Войти <span className="it">в</span> аккаунт</h1>

      {error && <div className="form-error">{error}</div>}

      <label className="field">
        <span>Юзернейм или почта</span>
        <div className="input">
          <input name="login" id="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="@fedonko" autoComplete="username" autoCapitalize="none" required />
        </div>
      </label>

      <label className="field" htmlFor="password">
        <span className="field-row">Пароль<button type="button" className="forgot" onClick={() => { setForgot(true); setError(""); }}>Забыли пароль?</button></span>
        <div className="input">
          <input name="password" id="password" type="password" autoComplete="current-password" required />
        </div>
      </label>

      <button className="btn" type="submit" disabled={pending}>{pending ? "Вхожу…" : "Войти"}</button>
      <p className="switch">Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></p>
    </form>
  );
}
