"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { AuthSide } from "../AuthSide";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => { if (me) router.replace(profileHref(me.username)); }, [me, router]);

  return (
    <div className="auth">
      <AuthSide title={<>С <span className="it">возвращением</span></>} text="Твои задачи, чаты и прогресс ждут." />
      <main className="auth-main">
        <LoginForm />
      </main>
    </div>
  );
}
