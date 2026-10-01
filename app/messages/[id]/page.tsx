import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { userCard } from "@/lib/social";
import { ChatThread } from "./ChatThread";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Мессенджер" };

export default async function ChatPage({ params }: Props) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const { id } = await params;

  const member = await db.chatMember.findUnique({ where: { chatId_userId: { chatId: id, userId: me.id } } });
  if (!member) notFound();

  const other = await db.chatMember.findFirst({ where: { chatId: id, userId: { not: me.id } }, include: { user: userCard } });
  if (!other) notFound();

  const u = other.user;
  return (
    <ChatThread
      key={id}
      chatId={id}
      meId={me.id}
      other={{
        username: u.username,
        displayName: u.profile?.displayName ?? u.username,
        avatar: u.profile?.avatar ?? null,
        accent: u.profile?.accent ?? "edit",
      }}
    />
  );
}
