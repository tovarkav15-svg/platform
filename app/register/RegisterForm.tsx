"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { register, type FormState } from "../actions";
import { NICHES } from "@/lib/niches";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";

type Check = { state: "idle" | "checking" | "ok" | "bad"; message: string };

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};

  const [username, setUsername] = useState(v.username ?? "");
  const [check, setCheck] = useState<Check>({ state: "idle", message: "Латиница, цифры, точка и _" });
  const [showPass, setShowPass] = useState(false);
  const selected = (v.niches ?? "").split(",");

  // Проверяем юзернейм, пока человек печатает
  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) return setCheck({ state: "idle", message: "Латиница, цифры, точка и _" });
    const local = validateUsername(u);
    if (local) return setCheck({ state: "bad", message: local });
    setCheck({ state: "checking", message: "Проверяю…" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/username?u=${encodeURIComponent(u)}`, { signal: ctrl.signal });
        const d = await r.json();
        setCheck({ state: d.ok ? "ok" : "bad", message: d.ok ? `@${u} свободен` : d.message });
      } catch {}
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [username]);

  const usernameHint = e.username && check.state !== "ok" ? { cls: "bad", msg: e.username } : { cls: check.state === "ok" ? "good" : check.state === "bad" ? "bad" : "", msg: check.message };

  return (
    <form action={action} className="auth-form" noValidate>
      <div className="label">Регистрация</div>
      <h1 className="caps">Создай <span className="it">свой</span> профиль</h1>

      {e.form && <div className="form-error">{e.form}</div>}

      <label className="field">
        <span>Имя</span>
        <div className={`input ${e.displayName ? "err" : ""}`}>
          <input name="displayName" id="displayName" defaultValue={v.displayName} placeholder="Как к тебе обращаться" autoComplete="name" maxLength={40} />
        </div>
        <span className="hint bad">{e.displayName}</span>
      </label>

      <label className="field">
        <span>Юзернейм</span>
        <div className={`input ${usernameHint.cls === "bad" ? "err" : ""}`}>
          <span className="at">@</span>
          <input
            name="username" id="username" value={username} placeholder="fedonko"
            onChange={(ev) => setUsername(ev.target.value.replace(/^@+/, "").toLowerCase())}
            autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX}
          />
        </div>
        <span className={`hint ${usernameHint.cls}`}>{usernameHint.msg}</span>
      </label>

      <label className="field">
        <span>Почта</span>
        <div className={`input ${e.email ? "err" : ""}`}>
          <input name="email" id="email" type="email" defaultValue={v.email} placeholder="you@mail.ru" autoComplete="email" />
        </div>
        <span className="hint bad">{e.email}</span>
      </label>

      <label className="field">
        <span>Пароль</span>
        <div className={`input ${e.password ? "err" : ""}`}>
          <input name="password" id="password" type={showPass ? "text" : "password"} placeholder="Минимум 8 символов, буквы и цифра" autoComplete="new-password" />
          <button type="button" onClick={() => setShowPass((s) => !s)}>{showPass ? "Скрыть" : "Показать"}</button>
        </div>
        <span className="hint bad">{e.password}</span>
      </label>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>Твои ниши <span style={{ color: "var(--mute)", fontWeight: 400 }}>· можно позже</span></span>
        <div className="chips">
          {NICHES.map((n) => (
            <label key={n.id} className="chip" style={{ "--c": n.color } as React.CSSProperties}>
              <input type="checkbox" name="niches" value={n.id} defaultChecked={selected.includes(n.id)} />
              <span>{n.title}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button className="btn" type="submit" disabled={pending}>{pending ? "Создаю аккаунт…" : "Создать аккаунт"}</button>
      <p className="switch">Уже есть аккаунт? <Link href="/login">Войти</Link></p>
    </form>
  );
}
