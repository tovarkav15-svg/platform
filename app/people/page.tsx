"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// people теперь живёт внутри Community
export default function Redirect() {
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    const rest = new URLSearchParams(sp.toString());
    rest.delete("tab");
    const qs = rest.toString();
    router.replace(`/community/?tab=people${qs ? `&${qs}` : ""}`);
  }, [router, sp]);
  return null;
}
