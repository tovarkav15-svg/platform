import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthSide } from "../AuthSide";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(`/u/${user.username}`);

  return (
    <div className="auth">
      <AuthSide
        title={<>Расти <span className="it">каждый</span> день</>}
        text="Обучение по нишам, свои люди, цели и марафоны. Всё в одном месте."
      />
      <main className="auth-main">
        <RegisterForm />
      </main>
    </div>
  );
}
