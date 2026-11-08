"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase, type ChatListItem, type Profile } from "@/lib/supabase";
import { chatHref, profileHref } from "@/lib/links";
import { rub } from "@/lib/workspace";
import { PRIORITY, addDays, dueLabel, iso, nextDue, today, type PlanTask } from "@/lib/plans";
import { tierOf } from "@/lib/aura";
import { ChatAvatar, chatTitle } from "./messages/ChatAvatar";
import { Ico } from "./MobileDrawer";

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

/** Главный экран после входа: всё важное на сегодня — как «Обзор» в планировщиках жизни */
export function Dashboard({ me }: { me: Profile }) {
  const [tasks, setTasks] = useState<PlanTask[] | null>(null);
  const [money, setMoney] = useState({ income: 0, expense: 0 });
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [aura, setAura] = useState<number | null>(null);
  const [responses, setResponses] = useState(0);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const td = today();

  const load = useCallback(async () => {
    const month = td.slice(0, 7);
    const [t, f, c, a, r] = await Promise.all([
      supabase.from("plan_tasks").select("*").eq("user_id", me.id).eq("done", false).not("due_date", "is", null).lte("due_date", iso(addDays(new Date(), 0))).order("due_date"),
      supabase.from("fin_transactions").select("type, amount").eq("user_id", me.id).gte("date", `${month}-01`),
      supabase.rpc("list_chats"),
      supabase.rpc("my_aura", { p_user: me.id }),
      supabase.from("order_responses").select("id, orders!inner(client_id, status)", { count: "exact", head: true })
        .eq("orders.client_id", me.id).eq("orders.status", "open").eq("status", "sent"),
    ]);
    setTasks(((t.data as PlanTask[]) ?? []).sort((x, y) => y.priority - x.priority));
    const tx = (f.data as { type: string; amount: number }[]) ?? [];
    setMoney({
      income: tx.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0),
      expense: tx.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0),
    });
    setChats(((c.data as ChatListItem[]) ?? []).filter((x) => !(x.kind === "support" && x.support_for !== me.id) && x.last_at)
      .sort((x, y) => (y.unread ? 1 : 0) - (x.unread ? 1 : 0) || (y.last_at ?? "").localeCompare(x.last_at ?? "")));
    setAura((a.data as number) ?? 0);
    setResponses(r.count ?? 0);
  }, [me.id, td]);

  useEffect(() => { document.title = "Обзор · Relic"; load(); }, [load]);

  async function complete(t: PlanTask) {
    setGone((s) => new Set(s).add(t.id));
    if (t.repeat && t.due_date) await supabase.from("plan_tasks").update({ due_date: nextDue(t.due_date, t.repeat) }).eq("id", t.id);
    else await supabase.from("plan_tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", t.id);
    window.dispatchEvent(new Event("plans:done"));
  }

  const hour = new Date().getHours();
  const hello = hour < 5 ? "Не спится" : hour < 12 ? "Утро" : hour < 18 ? "День" : "Вечер";
  const first = me.display_name.split(" ")[0] || me.display_name;
  const left = (tasks ?? []).filter((t) => !gone.has(t.id));
  const unread = chats.reduce((s, c) => s + c.unread, 0);
  const monthName = new Date().toLocaleDateString("ru-RU", { month: "long" });
  const tier = aura === null ? null : tierOf(aura);

  return (
    <main className="page wide db">
      <header className="db-hello">
        <h1>{hello}, {first}</h1>
        <p>{tasks === null ? "Собираем твой день…" : left.length ? `В плане ${left.length} ${plural(left.length, "дело", "дела", "дел")}${unread ? `, и ${unread} ${plural(unread, "новое сообщение", "новых сообщения", "новых сообщений")}` : ""}.` : "План на сегодня пуст — загляни на Биржу за новым заказом."}</p>
      </header>

      <div className="db-row">
        <Link href="/workspace/?tab=plans" className="db-card db-violet">
          <span className="db-ico"><Ico name="workspace" /></span>
          <small>Дела на сегодня</small>
          <b>{tasks === null ? "—" : left.length}</b>
          <span className="db-foot"><span>{gone.size ? `Готово: ${gone.size}` : "Задачи и планы"}</span><span>Открыть →</span></span>
        </Link>
        <Link href="/workspace/?tab=finance" className="db-card db-green">
          <span className="db-ico"><Ico name="jobs" /></span>
          <small>Заработано в {monthName === "май" ? "мае" : monthName.replace(/ь$/, "е").replace(/т$/, "те")}</small>
          <b>{rub(money.income)}</b>
          <span className="db-foot"><span>Потрачено {rub(money.expense)}</span><span>Финансы →</span></span>
        </Link>
        <Link href="/messages/" className="db-card">
          <span className="db-ico"><Ico name="chats" /></span>
          <small>Новые сообщения</small>
          <b>{unread}</b>
          <span className="db-foot"><span>{unread ? "Тебе написали" : "Всё прочитано"}</span><span>Чаты →</span></span>
        </Link>
      </div>

      <div className="db-row two">
        <section className="db-card db-list">
          <header><b>Сегодня</b><Link href="/workspace/?tab=plans&focus=new-task" className="db-plus" aria-label="Добавить задачу">+</Link></header>
          {tasks === null ? <div className="skeleton list-skeleton" /> : left.length === 0 ? (
            <p className="db-empty">Дел нет. <Link href="/workspace/?tab=plans&focus=new-task">Добавить задачу</Link></p>
          ) : (
            <ul>
              {left.slice(0, 6).map((t) => (
                <li key={t.id} style={{ "--p": PRIORITY[t.priority].c } as React.CSSProperties}>
                  <button type="button" className={`pchk p${t.priority}`} onClick={() => complete(t)} aria-label="Выполнить" />
                  <span>{t.title}</span>
                  <em className={t.due_date! < td ? "late" : ""}>{dueLabel(t.due_date, t.due_time)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="db-card db-list">
          <header><b>Чаты</b><Link href="/messages/" className="link-btn">Все</Link></header>
          {chats.length === 0 ? <p className="db-empty">Пока пусто. <Link href="/community/">Найти людей</Link></p> : (
            <ul>
              {chats.slice(0, 5).map((c) => (
                <li key={c.chat_id}>
                  <Link href={chatHref(c.chat_id)} className="db-chat">
                    <ChatAvatar c={c} size={30} />
                    <span className="db-chat-t"><b>{chatTitle(c)}</b><small>{c.last_text || "Сообщение"}</small></span>
                    {c.unread > 0 && <em className="count-badge">{c.unread > 99 ? "99+" : c.unread}</em>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="db-row">
        <Link href="/jobs/?tab=my-orders" className="db-card db-mini">
          <small>Отклики на мои заказы</small><b>{responses}</b><span>{responses ? "Ждут ответа" : "Разместить заказ на Бирже"}</span>
        </Link>
        <Link href="/aura/" className="db-card db-mini">
          <small>AURA — рейтинг за дела</small><b>{aura ?? "—"}</b><span>{tier ? `Уровень «${tier.fullName}»` : ""}</span>
        </Link>
        <Link href={profileHref(me.username)} className="db-card db-mini">
          <small>Мой профиль</small><b className="db-name">@{me.username}</b><span>Ссылка для клиентов</span>
        </Link>
      </div>

      <section className="db-map">
        <h2>Что где в Relic</h2>
        <div>
          {[
            { href: "/messages/", icon: "chats", t: "Чаты", s: "Переписка, группы, звонки. Люди и лента — тут же." },
            { href: "/jobs/", icon: "jobs", t: "Биржа", s: "Найти заказ или исполнителя. Сделки с этапами." },
            { href: "/workspace/", icon: "workspace", t: "Workspace", s: "Твои дела: задачи, клиенты, проекты, деньги, заметки." },
            { href: profileHref(me.username), icon: "profile", t: "Профиль", s: "Твоя витрина: работы, отзывы, AURA, настройки." },
          ].map((x) => (
            <Link key={x.t} href={x.href} className="db-map-i">
              <span className="db-ico"><Ico name={x.icon} /></span>
              <b>{x.t}</b><small>{x.s}</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
