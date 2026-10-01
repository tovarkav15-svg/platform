"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";
import { startHeartbeat } from "./presence";

type Ctx = {
  ready: boolean;
  session: Session | null;
  me: Profile | null;
  refreshMe: () => Promise<void>;
};

const SessionContext = createContext<Ctx>({ ready: false, session: null, me: null, refreshMe: async () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  const loadMe = useCallback(async (s: Session | null) => {
    if (!s) return setMe(null);
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setMe(data as Profile | null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadMe(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // вызов вне колбэка, как советует Supabase
      setTimeout(() => loadMe(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMe]);

  // Пока человек на сайте, отмечаем его «в сети»
  const uid = session?.user.id;
  useEffect(() => (uid ? startHeartbeat(uid) : undefined), [uid]);

  const refreshMe = useCallback(() => loadMe(session), [loadMe, session]);

  return <SessionContext.Provider value={{ ready, session, me, refreshMe }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Для страниц, куда нельзя без входа */
export function useRequireMe() {
  const s = useSession();
  const router = useRouter();
  useEffect(() => {
    if (s.ready && !s.session) router.replace("/login");
  }, [s.ready, s.session, router]);
  return s;
}

export async function signOut() {
  await supabase.auth.signOut();
}
