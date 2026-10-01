"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type SettingsState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<SettingsState, FormData>(changePassword, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  const e = state.errors ?? {};

  return (
    <form ref={ref} action={action} className="card">
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
        {state.ok && <span className="hint good">{state.message}</span>}
      </div>
    </form>
  );
}
