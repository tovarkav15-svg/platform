import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "session";
const SESSION_DAYS = 30;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // В базе храним только хэш токена: утечка базы не даёт войти в чужой аккаунт
  await db.session.create({ data: { id: hash(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: { include: { profile: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hash(token) } });
  store.delete(COOKIE);
}
