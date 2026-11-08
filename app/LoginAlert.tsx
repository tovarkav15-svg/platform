"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { deviceName } from "@/lib/device";

type Sess = { id: string; user_agent: string | null; created_at: string; current: boolean };
const KEY = "relic:seen-sessions";
const read = (): string[] | null => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
const write = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-50))); } catch {} };

/** «Новый вход в аккаунт: iPhone · Safari. Это ты?» — как служебное сообщение Telegram о входе с нового устройства */
export function LoginAlert() {
  const { me } = useSession();
  const [fresh, setFresh] = useState<Sess | null>(null);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!me) return;
    supabase.rpc("my_sessions").then(({ data }) => {
      const list = (data as Sess[]) ?? [];
      const seen = read();
      // На этом устройстве впервые — все нынешние входы считаем знакомыми
      if (!seen) return write(list.map((s) => s.id));
      const weekAgo = Date.now() - 7 * 864e5;
      const n = list.find((s) => !s.current && !seen.includes(s.id) && new Date(s.created_at).getTime() > weekAgo);
      setFresh(n ?? null);
    });
  }, [me]);

  if (!fresh && !done) return null;
  const ok = () => { if (fresh) write([...(read() ?? []), fresh.id]); setFresh(null); };
  const no = async () => {
    if (!fresh) return;
    await supabase.rpc("end_my_session", { p_id: fresh.id });
    write([...(read() ?? []), fresh.id]);
    setFresh(null);
    setDone("Тот вход закрыт. Смени пароль, чтобы туда не вошли снова.");
  };
  return (
    <div className="login-alert" role="alert">
      {fresh ? (
        <>
          <span><b>Новый вход в аккаунт</b><small>{deviceName(fresh.user_agent)} · {new Date(fresh.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Это ты?</small></span>
          <button type="button" className="btn sm" onClick={ok}>Да, это я</button>
          <button type="button" className="btn sm ghost" onClick={no}>Нет, закрыть</button>
        </>
      ) : (
        <>
          <span><b>Готово</b><small>{done}</small></span>
          <Link className="btn sm" href="/settings/?s=security" onClick={() => setDone("")}>Сменить пароль</Link>
          <button type="button" className="btn sm ghost" onClick={() => setDone("")}>Позже</button>
        </>
      )}
    </div>
  );
}
