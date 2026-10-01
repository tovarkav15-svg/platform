"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    setPending(true);
    setError("");
    const { error } = await signIn(String(form.get("login") ?? ""), String(form.get("password") ?? ""));
    if (error) {
      setPending(false);
      return setError(error);
    }
    router.replace("/");
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="label">Вход</div>
      <h1 className="caps">Войти <span className="it">в</span> аккаунт</h1>

      {error && <div className="form-error">{error}</div>}

      <label className="field">
        <span>Юзернейм или почта</span>
        <div className="input">
          <input name="login" id="login" placeholder="@fedonko" autoComplete="username" autoCapitalize="none" required />
        </div>
      </label>

      <label className="field">
        <span>Пароль</span>
        <div className="input">
          <input name="password" id="password" type="password" autoComplete="current-password" required />
        </div>
      </label>

      <button className="btn" type="submit" disabled={pending}>{pending ? "Вхожу…" : "Войти"}</button>
      <p className="switch">Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></p>
    </form>
  );
}
