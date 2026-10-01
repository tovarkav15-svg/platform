"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { NICHES } from "@/lib/niches";

export type FormState = {
  errors?: Partial<Record<"displayName" | "username" | "email" | "password" | "form", string>>;
  values?: Record<string, string>;
};

export async function register(_prev: FormState, form: FormData): Promise<FormState> {
  const displayName = String(form.get("displayName") ?? "").trim();
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const nicheIds = NICHES.map((n) => n.id) as string[];
  const niches = form.getAll("niches").map(String).filter((id) => nicheIds.includes(id));

  const errors: FormState["errors"] = {};
  if (displayName.length < 2) errors.displayName = "Напиши, как тебя зовут";
  const usernameError = validateUsername(username);
  if (usernameError) errors.username = usernameError;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Проверь почту";
  if (password.length < 8) errors.password = "Минимум 8 символов";
  else if (!/\d/.test(password) || !/[a-zA-Zа-яА-Я]/.test(password)) errors.password = "Нужны буквы и хотя бы одна цифра";

  if (!errors.username && (await db.user.findUnique({ where: { username } })))
    errors.username = "Этот юзернейм уже занят";
  if (!errors.email && (await db.user.findUnique({ where: { email } })))
    errors.email = "На эту почту уже есть аккаунт";

  if (Object.keys(errors).length) {
    return { errors, values: { displayName, username, email, niches: niches.join(",") } };
  }

  const user = await db.user.create({
    data: {
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      profile: { create: { displayName, niches: niches.join(",") } },
    },
  });
  await createSession(user.id);
  redirect(`/u/${username}`);
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const login = String(form.get("login") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const where = login.includes("@") && !login.startsWith("@")
    ? { email: login.toLowerCase() }
    : { username: normalizeUsername(login) };

  const user = await db.user.findUnique({ where });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { errors: { form: "Неверный логин или пароль" }, values: { login } };
  }
  await createSession(user.id);
  redirect(`/u/${user.username}`);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
