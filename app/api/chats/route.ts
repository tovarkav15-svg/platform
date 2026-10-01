import { getCurrentUser } from "@/lib/auth";
import { listChats } from "@/lib/social";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ chats: await listChats(me.id) });
}
