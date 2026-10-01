import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };
const MAX_LEN = 2000;

async function membership(chatId: string) {
  const me = await getCurrentUser();
  if (!me) return null;
  const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId: me.id } } });
  return member ? me : null;
}

const toJson = (m: { id: string; text: string; senderId: string; createdAt: Date }) => ({
  id: m.id, text: m.text, senderId: m.senderId, at: m.createdAt.toISOString(),
});

// Новые сообщения после ?after=ISO (или последние 100) + отметка о прочтении
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const me = await membership(id);
  if (!me) return Response.json({ error: "not found" }, { status: 404 });

  const after = new URL(req.url).searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const messages = afterDate && !isNaN(+afterDate)
    ? await db.message.findMany({ where: { chatId: id, createdAt: { gt: afterDate } }, orderBy: { createdAt: "asc" } })
    : (await db.message.findMany({ where: { chatId: id }, orderBy: { createdAt: "desc" }, take: 100 })).reverse();

  await db.chatMember.update({ where: { chatId_userId: { chatId: id, userId: me.id } }, data: { lastReadAt: new Date() } });

  // Когда собеседник последний раз читал чат, чтобы показать «прочитано»
  const other = await db.chatMember.findFirst({ where: { chatId: id, userId: { not: me.id } }, select: { lastReadAt: true } });
  return Response.json({ messages: messages.map(toJson), otherReadAt: other?.lastReadAt.toISOString() ?? null });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const me = await membership(id);
  if (!me) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return Response.json({ error: "Пустое сообщение" }, { status: 400 });
  if (text.length > MAX_LEN) return Response.json({ error: `Максимум ${MAX_LEN} символов` }, { status: 400 });

  const message = await db.message.create({ data: { chatId: id, senderId: me.id, text } });
  await db.chat.update({ where: { id }, data: { updatedAt: new Date() } });
  await db.chatMember.update({ where: { chatId_userId: { chatId: id, userId: me.id } }, data: { lastReadAt: message.createdAt } });
  return Response.json({ message: toJson(message) });
}
