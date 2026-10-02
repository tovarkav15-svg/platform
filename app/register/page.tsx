"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  const { me } = useSession();
  const router = useRouter();
  useEffect(() => { if (me) router.replace(profileHref(me.username)); }, [me, router]);

  return (
    <div className="auth rg">
      <div className="rg-bg" aria-hidden="true"><i /><i /><i /></div>
      <RegisterForm />
    </div>
  );
}
