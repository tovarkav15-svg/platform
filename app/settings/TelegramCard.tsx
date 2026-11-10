"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BOT_URL } from "@/lib/telegram";

type Link = { tg_username: string; notify: boolean; can_write: boolean };

/** Настройки → Безопасность: Telegram привязан? Уведомления от бота, отвязка */
export function TelegramCard({ needPassword = false }: { needPassword?: boolean }) {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [ask, setAsk] = useState(false);
  const load = () => supabase.from("tg_links").select("tg_username, notify, can_write").maybeSingle().then(({ data }) => setLink((data as Link) ?? null));
  useEffect(() => { load(); }, []);

  if (link === undefined) return null;
  return (
    <section className="card tg-card">
      <h2 className="h-md caps">Telegram</h2>
      {link ? (
        <>
          <p className="hint">Привязан{link.tg_username ? <> к <b>@{link.tg_username}</b></> : null}. В мини-приложении <a href={BOT_URL} target="_blank" rel="noreferrer">@relicprodbot</a> вход в одно касание.</p>
          <label className="tg-row">
            <input type="checkbox" checked={link.notify} onChange={async (e) => { const on = e.target.checked; setLink({ ...link, notify: on }); await supabase.rpc("tg_set_notify", { p_on: on }); }} />
            <span><b>Уведомления в Telegram</b><small>Новые сообщения и отклики на твои заказы — сообщением от бота</small></span>
          </label>
          {!link.can_write && <p className="hint bad">Бот пока не может тебе писать: открой <a href={BOT_URL} target="_blank" rel="noreferrer">@relicprodbot</a> и нажми «Старт».</p>}
          {needPassword ? (
            <p className="hint">Ты входишь только через Telegram. Чтобы отвязать его, сначала задай пароль выше.</p>
          ) : ask ? (
            <div className="save-row">
              <button type="button" className="btn ghost" onClick={async () => { await supabase.rpc("tg_unlink"); setAsk(false); load(); }}>Да, отвязать</button>
              <button type="button" className="btn ghost" onClick={() => setAsk(false)}>Отмена</button>
            </div>
          ) : (
            <div className="save-row"><button type="button" className="btn ghost" onClick={() => setAsk(true)}>Отвязать Telegram</button></div>
          )}
        </>
      ) : (
        <>
          <p className="hint">Открой Relic в Telegram — аккаунт привяжется сам: вход в одно касание и уведомления от бота.</p>
          <div className="save-row"><a className="btn" href={BOT_URL} target="_blank" rel="noreferrer">Открыть @relicprodbot</a></div>
        </>
      )}
    </section>
  );
}
