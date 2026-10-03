"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Пришёл по ссылке-приглашению (?ref=username) — запоминаем, кто позвал, до самой регистрации */
export function RefCatcher() {
  const ref = useSearchParams().get("ref");
  useEffect(() => {
    if (ref && /^[a-z0-9._]{3,20}$/i.test(ref)) try { localStorage.setItem("relic:ref", ref.toLowerCase()); } catch {}
  }, [ref]);
  return null;
}

export function savedRef() {
  try { return localStorage.getItem("relic:ref"); } catch { return null; }
}
