"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});

  return (
    <form action={action} className="auth-form">
      <div className="label">Вход</div>
      <h1 className="caps">Войти <span className="it">в</span> аккаунт</h1>

      {state.errors?.form && <div className="form-error">{state.errors.form}</div>}

      <label className="field">
        <span>Юзернейм или почта</span>
        <div className="input">
          <input name="login" id="login" defaultValue={state.values?.login} placeholder="@fedonko" autoComplete="username" autoCapitalize="none" required />
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
