// Живые списки: перезагружаем данные, как только в нужных таблицах что-то изменилось.
// Realtime + страховочный опрос + обновление при возвращении на вкладку (не чаще раза в 10 секунд)
import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export function useLive(tables: string[], reload: () => unknown, { poll = 30000, enabled = true }: { poll?: number; enabled?: boolean } = {}) {
  const fn = useRef(reload);
  fn.current = reload;
  const key = tables.join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = Date.now();
    const run = () => { last = Date.now(); fn.current(); };
    // Пачку изменений (например, регистрация создаёт несколько строк) собираем в одно обновление
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(run, 400); };
    const ch = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    key.split(",").forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, bump));
    ch.subscribe();
    const t = setInterval(() => { if (!document.hidden && Date.now() - last >= poll - 500) run(); }, poll);
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 3000 && Date.now() - last > 10000) run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { if (timer) clearTimeout(timer); clearInterval(t); document.removeEventListener("visibilitychange", onVis); supabase.removeChannel(ch); };
  }, [key, poll, enabled]);
}
