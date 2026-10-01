import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listChats } from "@/lib/social";
import { TopBar } from "../TopBar";
import { MessengerShell } from "./MessengerShell";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const chats = await listChats(me.id);

  return (
    <div className="messenger-page">
      <TopBar />
      <MessengerShell initialChats={chats}>{children}</MessengerShell>
    </div>
  );
}
