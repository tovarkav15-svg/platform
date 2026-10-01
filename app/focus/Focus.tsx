"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Modal } from "../Modal";

export function focusLeft(until: string | null | undefined) {
  if (!until) return 0;
  return Math.max(0, new Date(until).getTime() - Date.now());
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

/** В фокусе открыт только Workspace: остальные разделы возвращают туда */
export function FocusGuard({ children }: { children: React.ReactNode }) {
  const { me, refreshMe } = useSession();
  const path = usePathname();
  const router = useRouter();
  const left = focusLeft(me?.focus_until);

  useEffect(() => {
    if (left > 0 && !path.startsWith("/workspace")) router.replace("/workspace/");
  }, [left > 0, path, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Когда время фокуса вышло — обновляем профиль, и разделы снова открываются
  useEffect(() => {
    if (!left) return;
    const t = setTimeout(() => refreshMe(), left + 500);
    return () => clearTimeout(t);
  }, [me?.focus_until]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}

const PRESETS = [
  { min: 25, label: "25 минут", sub: "Помидор" },
  { min: 50, label: "50 минут", sub: "Глубокая работа" },
  { min: 90, label: "1,5 часа", sub: "Большая задача" },
  { min: 180, label: "3 часа", sub: "Полдня в тишине" },
];

/** Кнопка в шапке: включить фокус или показать таймер и выйти */
export function FocusButton() {
  const { me, refreshMe } = useSession();
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const left = focusLeft(me?.focus_until);

  useEffect(() => {
    if (!left) return;
    const t = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;

  async function start(min: number) {
    await supabase.from("profiles").update({ focus_until: new Date(Date.now() + min * 60000).toISOString() }).eq("id", me!.id);
    await refreshMe();
    setOpen(false);
  }
  async function stop() {
    await supabase.from("profiles").update({ focus_until: null }).eq("id", me!.id);
    await refreshMe();
  }

  if (left > 0) {
    return (
      <span className="focus-pill" role="status">
        <i className="focus-orb" />
        <span className="mono">{fmt(left)}</span>
        <button type="button" onClick={stop}>Выйти из фокуса</button>
      </span>
    );
  }

  return (
    <>
      <button type="button" className="focus-btn" onClick={() => setOpen(true)} title="Режим фокуса">
        <i className="focus-orb" /><span>Фокус</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={<>Режим <span className="it">фокуса</span></>}>
        {open && (
          <div className="focus-modal">
            <p className="lead">На это время тебе никто не сможет написать в личку и позвонить. Все разделы закроются, кроме Workspace. Другие увидят, что ты в фокусе.</p>
            <div className="focus-presets">
              {PRESETS.map((p, i) => (
                <button key={p.min} type="button" style={{ "--i": i } as React.CSSProperties} onClick={() => start(p.min)}>
                  <b>{p.label}</b><small>{p.sub}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
