"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { AuthSide } from "./AuthSide";

// Временная стартовая страница, позже здесь будет лендинг
export default function Home() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => { if (me) router.replace(profileHref(me.username)); }, [me, router]);

  return (
    <div className="auth">
      <AuthSide
        title={<>Расти <span className="it">каждый</span> день, а не по понедельникам</>}
        text="Relic — платформа для фрилансеров и тех, кто растёт."
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
