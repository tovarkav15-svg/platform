"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NICHES } from "@/lib/niches";
import { isUsernameTaken, signUp } from "@/lib/api";
import { profileHref } from "@/lib/links";
import { useSession } from "@/lib/session";
import { normalizeUsername, validateUsername, USERNAME_MAX } from "@/lib/username";

type Errors = Partial<Record<"displayName" | "username" | "email" | "password" | "form", string>>;

export function RegisterForm() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<{ cls: string; msg: string }>({ cls: "", msg: "Латиница, цифры, точка и _" });
  const [showPass, setShowPass] = useState(false);

  // Проверяем юзернейм, пока человек печатает
  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u) return setCheck({ cls: "", msg: "Латиница, цифры, точка и _" });
    const local = validateUsername(u);
    if (local) return setCheck({ cls: "bad", msg: local });
    setCheck({ cls: "", msg: "Проверяю…" });
    let alive = true;
    const t = setTimeout(async () => {
      const taken = await isUsernameTaken(u);
      if (alive) setCheck(taken ? { cls: "bad", msg: "Уже занят" } : { cls: "good", msg: `@${u} свободен` });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [username]);

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const u = normalizeUsername(username);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const niches = form.getAll("niches").map(String);

    const e: Errors = {};
    if (displayName.length < 2) e.displayName = "Напиши, как тебя зовут";
    const uErr = validateUsername(u);
    if (uErr) e.username = uErr;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Проверь почту";
    if (password.length < 8) e.password = "Минимум 8 символов";
    else if (!/\d/.test(password) || !/[a-zA-Zа-яА-Я]/.test(password)) e.password = "Нужны буквы и хотя бы одна цифра";
    if (Object.keys(e).length) return setErrors(e);

    setPending(true);
    setErrors({});
    if (await isUsernameTaken(u)) {
      setPending(false);
      return setErrors({ username: "Этот юзернейм уже занят" });
    }
    const { data, error } = await signUp({ username: u, displayName, email, password, niches });
    if (error || !data.session) {
      setPending(false);
      return setErrors({ form: error?.message.includes("weak") ? "Пароль слишком простой" : "Не получилось создать аккаунт. Попробуй ещё раз." });
    }
    await refreshMe();
    router.replace(profileHref(u));
  }

  return (
    <form onSubmit={onSubmit} className="auth-form" noValidate>
      <div className="label">Регистрация</div>
      <h1 className="caps">Создай <span className="it">свой</span> профиль</h1>

      {errors.form && <div className="form-error">{errors.form}</div>}

      <label className="field">
        <span>Имя</span>
        <div className={`input ${errors.displayName ? "err" : ""}`}>
          <input name="displayName" id="displayName" placeholder="Как к тебе обращаться" autoComplete="name" maxLength={40} />
        </div>
        <span className="hint bad">{errors.displayName}</span>
      </label>

      <label className="field">
        <span>Юзернейм</span>
        <div className={`input ${errors.username || check.cls === "bad" ? "err" : ""}`}>
          <span className="at">@</span>
          <input
            id="username" value={username} placeholder="fedonko"
            onChange={(ev) => setUsername(ev.target.value.replace(/^@+/, "").toLowerCase())}
            autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX}
          />
        </div>
        <span className={`hint ${errors.username ? "bad" : check.cls}`}>{errors.username || check.msg}</span>
      </label>

      <label className="field">
        <span>Почта</span>
        <div className={`input ${errors.email ? "err" : ""}`}>
          <input name="email" id="email" type="email" placeholder="you@mail.ru" autoComplete="email" />
        </div>
        <span className="hint bad">{errors.email}</span>
      </label>

      <label className="field">
        <span>Пароль</span>
        <div className={`input ${errors.password ? "err" : ""}`}>
          <input name="password" id="password" type={showPass ? "text" : "password"} placeholder="Минимум 8 символов, буквы и цифра" autoComplete="new-password" />
          <button type="button" onClick={() => setShowPass((s) => !s)}>{showPass ? "Скрыть" : "Показать"}</button>
        </div>
        <span className="hint bad">{errors.password}</span>
      </label>

      <fieldset className="field plain">
        <span>Твои ниши <span style={{ color: "var(--mute)", fontWeight: 400 }}>· можно позже</span></span>
        <div className="chips">
          {NICHES.map((n) => (
            <label key={n.id} className="chip" style={{ "--c": n.color } as React.CSSProperties}>
              <input type="checkbox" name="niches" value={n.id} />
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
