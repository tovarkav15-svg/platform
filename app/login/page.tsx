import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthSide } from "../AuthSide";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(`/u/${user.username}`);

  return (
    <div className="auth">
      <AuthSide title={<>С <span className="it">возвращением</span></>} text="Твои задачи, чаты и прогресс ждут." />
      <main className="auth-main">
        <LoginForm />
      </main>
    </div>
  );
}
