"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { AuthSide } from "../AuthSide";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => { if (me) router.replace(profileHref(me.username)); }, [me, router]);

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
