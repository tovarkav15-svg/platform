"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Цели переехали в Workspace → Plans / Цели
export default function GoalsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/workspace/?tab=plans&view=goals"); }, [router]);
  return null;
}
