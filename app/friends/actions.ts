"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateDm } from "@/lib/social";

async function meAndTarget(form: FormData) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const targetId = String(form.get("userId") ?? "");
  const target = targetId && targetId !== me.id ? await db.user.findUnique({ where: { id: targetId } }) : null;
  return { me, target };
}

const between = (a: string, b: string) => ({
  OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }],
});

function refresh() {
  revalidatePath("/friends");
  revalidatePath("/u/[username]", "page");
}

export async function sendRequest(form: FormData) {
  const { me, target } = await meAndTarget(form);
  if (!target) return;
  const existing = await db.friendship.findFirst({ where: between(me.id, target.id) });
  if (!existing) {
    await db.friendship.create({ data: { requesterId: me.id, addresseeId: target.id } });
  } else if (existing.status === "pending" && existing.addresseeId === me.id) {
    // Встречная заявка: сразу дружим
    await db.friendship.update({ where: { id: existing.id }, data: { status: "accepted" } });
  }
  refresh();
}

export async function acceptRequest(form: FormData) {
  const { me, target } = await meAndTarget(form);
  if (!target) return;
  await db.friendship.updateMany({
    where: { requesterId: target.id, addresseeId: me.id, status: "pending" },
    data: { status: "accepted" },
  });
  refresh();
}

/** Отклонить заявку, отменить свою или удалить из друзей */
export async function removeFriend(form: FormData) {
  const { me, target } = await meAndTarget(form);
  if (!target) return;
  await db.friendship.deleteMany({ where: between(me.id, target.id) });
  refresh();
}

export async function openChat(form: FormData) {
  const { me, target } = await meAndTarget(form);
  if (!target) return;
  const chat = await getOrCreateDm(me.id, target.id);
  redirect(`/messages/${chat.id}`);
}
