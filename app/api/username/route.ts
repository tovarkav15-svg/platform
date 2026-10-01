import { db } from "@/lib/db";
import { normalizeUsername, validateUsername } from "@/lib/username";

// Живая проверка юзернейма при регистрации: /api/username?u=fedonko
export async function GET(req: Request) {
  const username = normalizeUsername(new URL(req.url).searchParams.get("u") ?? "");
  const error = validateUsername(username);
  if (error) return Response.json({ ok: false, message: error });
  const taken = await db.user.findUnique({ where: { username }, select: { id: true } });
  return Response.json(taken ? { ok: false, message: "Уже занят" } : { ok: true, message: "Свободен" });
}
