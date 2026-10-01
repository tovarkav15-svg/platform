import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthSide } from "./AuthSide";

// Временная стартовая страница, позже здесь будет лендинг
export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(`/u/${user.username}`);

  return (
    <div className="auth">
      <AuthSide
        title={<>Расти <span className="it">каждый</span> день, а не по понедельникам</>}
        text="Платформа для фрилансеров и тех, кто растёт."
      />
      <main className="auth-main">
        <div className="auth-form">
          <div className="label">Добро пожаловать</div>
          <h1 className="caps">Начни <span className="it">сейчас</span></h1>
          <Link className="btn" href="/register">Создать аккаунт</Link>
          <Link className="btn ghost" href="/login">Войти</Link>
        </div>
      </main>
    </div>
  );
}
