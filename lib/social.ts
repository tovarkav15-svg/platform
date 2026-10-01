import "server-only";
import { db } from "./db";

export type FriendState = "none" | "friends" | "outgoing" | "incoming" | "self";

export async function friendState(meId: string, otherId: string): Promise<FriendState> {
  if (meId === otherId) return "self";
  const f = await db.friendship.findFirst({
    where: { OR: [{ requesterId: meId, addresseeId: otherId }, { requesterId: otherId, addresseeId: meId }] },
  });
  if (!f) return "none";
  if (f.status === "accepted") return "friends";
  return f.requesterId === meId ? "outgoing" : "incoming";
}

export const dmKey = (a: string, b: string) => [a, b].sort().join(":");

/** Находит личный чат с человеком или создаёт новый */
export async function getOrCreateDm(meId: string, otherId: string) {
  const key = dmKey(meId, otherId);
  const existing = await db.chat.findUnique({ where: { dmKey: key } });
  if (existing) return existing;
  return db.chat.create({
    data: { dmKey: key, members: { create: [{ userId: meId }, { userId: otherId }] } },
  });
}

const userCard = { select: { id: true, username: true, profile: { select: { displayName: true, avatar: true, accent: true } } } } as const;

/** Список чатов пользователя с последним сообщением и счётчиком непрочитанных */
export async function listChats(meId: string) {
  const memberships = await db.chatMember.findMany({
    where: { userId: meId },
    include: {
      chat: {
        include: {
          members: { where: { userId: { not: meId } }, include: { user: userCard } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { chat: { updatedAt: "desc" } },
  });

  return Promise.all(
    memberships.map(async (m) => {
      const other = m.chat.members[0]?.user;
      const last = m.chat.messages[0];
      const unread = await db.message.count({
        where: { chatId: m.chatId, senderId: { not: meId }, createdAt: { gt: m.lastReadAt } },
      });
      return {
        id: m.chatId,
        other: other && {
          id: other.id,
          username: other.username,
          displayName: other.profile?.displayName ?? other.username,
          avatar: other.profile?.avatar ?? null,
          accent: other.profile?.accent ?? "edit",
        },
        last: last ? { text: last.text, mine: last.senderId === meId, at: last.createdAt.toISOString() } : null,
        unread,
      };
    }),
  );
}

export type ChatListItem = Awaited<ReturnType<typeof listChats>>[number];
export { userCard };
