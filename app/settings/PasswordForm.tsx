"use client";

import { useState } from "react";
import { changePassword, type SettingsState } from "./save";

export function PasswordForm({ authEmail }: { authEmail: string }) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, setPending] = useState(false);
  const e = state.errors ?? {};

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const formEl = ev.currentTarget;
    const form = new FormData(formEl);
    setPending(true);
    const result = await changePassword(String(form.get("current") ?? ""), String(form.get("next") ?? ""), authEmail);
    if (result.ok) formEl.reset();
    setState(result);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h2 className="h-md caps">Смена <span className="it">пароля</span></h2>
      <div className="row2">
        <label className="field">
          <span>Текущий пароль</span>
          <div className={`input ${e.current ? "err" : ""}`}><input id="current" name="current" type="password" autoComplete="current-password" /></div>
          <span className="hint bad">{e.current}</span>
        </label>
        <label className="field">
          <span>Новый пароль</span>
          <div className={`input ${e.next ? "err" : ""}`}><input id="next" name="next" type="password" autoComplete="new-password" placeholder="Минимум 8 символов, буквы и цифра" /></div>
          <span className="hint bad">{e.next}</span>
        </label>
      </div>
      <div className="save-row">
        <button className="btn" type="submit" disabled={pending}>{pending ? "Меняю…" : "Сменить пароль"}</button>
        {state.message && <span className={`hint ${state.ok ? "good" : "bad"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
