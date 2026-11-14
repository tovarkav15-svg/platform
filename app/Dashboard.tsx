"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { publicMedia, supabase, type ChatListItem, type Profile } from "@/lib/supabase";
import { chatHref, profileHref } from "@/lib/links";
import { rub } from "@/lib/workspace";
import { PRIORITY, addDays, iso, nextDue, today, type PlanTask } from "@/lib/plans";
import { tierOf } from "@/lib/aura";
import { ChatAvatar, chatTitle } from "./messages/ChatAvatar";
import { Avatar } from "./Avatar";
import { Ico, SECTION_COLOR } from "./MobileDrawer";

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
  const hello = hour < 5 ? "Не спится" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const first = me.display_name.split(" ")[0] || me.display_name;
  const left = (tasks ?? []).filter((t) => !gone.has(t.id));
  const unread = chats.reduce((s, c) => s + c.unread, 0);
  const tier = aura === null ? null : tierOf(aura);
  const dateLine = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
  const total = left.length + gone.size;
  const donePct = total ? Math.round((gone.size / total) * 100) : 0;
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    const base = `${window.location.origin}${window.location.pathname.startsWith("/platform") ? "/platform" : ""}`;
    const url = base + profileHref(me.username);
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Скопируй ссылку", url); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  const banner = publicMedia(me.banner_path ?? null);
  const summary = tasks === null ? "Собираем твой день…"
    : left.length ? `${left.length} ${plural(left.length, "дело", "дела", "дел")} на сегодня${unread ? ` · ${unread} ${plural(unread, "сообщение", "сообщения", "сообщений")}` : ""}`
    : unread ? `Дел нет · ${unread} ${plural(unread, "сообщение", "сообщения", "сообщений")}` : "Свободный день";

  return (
    <main className="page wide db2">
      <DbBackdrop src={banner || me.avatar || null} />

      <header className="db2-hero">
        <div className="db2-id">
          <Link href={profileHref(me.username)} className="db2-ava" aria-label="Мой профиль"><Avatar name={me.display_name} avatar={me.avatar} accent={me.accent} size={64} /></Link>
          <div className="db2-hi">
            <span className="db2-date">{dateLine}</span>
            <h1>{hello}, {first}</h1>
            <p>{summary}</p>
          </div>
          <button type="button" className="db2-share" onClick={copyLink}>{copied ? "Скопировано ✓" : "Ссылка на профиль"}</button>
        </div>

        <div className="db2-stats">
          <Link href="/workspace/?tab=plans" className="db2-stat" style={{ "--c": SECTION_COLOR.workspace } as React.CSSProperties}>
            <small>Дела</small><b><Count n={tasks === null ? null : left.length} /></b>
            <i className="db2-bar"><i style={{ width: `${donePct}%` }} /></i>
          </Link>
          <Link href="/workspace/?tab=finance" className="db2-stat" style={{ "--c": "#1FA67A" } as React.CSSProperties}>
            <small>Заработано</small><b>{rub(money.income)}</b>
            <em>{money.expense ? `−${rub(money.expense)}` : "за месяц"}</em>
          </Link>
          <Link href="/messages/" className={`db2-stat${unread ? " hot" : ""}`} style={{ "--c": SECTION_COLOR.chats } as React.CSSProperties}>
            <small>Сообщения</small><b><Count n={unread} /></b>
            <em>{unread ? "новые" : "всё прочитано"}</em>
          </Link>
          <Link href="/aura/" className="db2-stat" style={{ "--c": tier?.color ?? "#FF4F8B" } as React.CSSProperties}>
            <small>AURA</small><b><Count n={aura} /></b>
            {tier ? <i className="db2-bar"><i style={{ width: `${Math.round(tier.stepProgress * 100)}%` }} /></i> : <em>—</em>}
          </Link>
        </div>
      </header>

      <div className="db2-grid">
        <section className="db2-card" style={{ "--c": SECTION_COLOR.workspace } as React.CSSProperties}>
          <header>
            <h2>Сегодня</h2>
            {gone.size > 0 && <span className="db2-done">Готово {gone.size}</span>}
            <Link href="/workspace/?tab=plans&focus=new-task" className="db2-plus" aria-label="Добавить задачу">+</Link>
          </header>
          {tasks === null ? <div className="skeleton list-skeleton" /> : left.length === 0 ? (
            <div className="db2-empty"><span>✓</span><p>Всё сделано</p><Link href="/workspace/?tab=plans&focus=new-task">Добавить задачу</Link></div>
          ) : (
            <ul className="db2-tasks">
              {left.slice(0, 6).map((t, i) => (
                <li key={t.id} style={{ "--p": PRIORITY[t.priority].c, "--i": i } as React.CSSProperties}>
                  <button type="button" className={`pchk p${t.priority}`} onClick={() => complete(t)} aria-label="Выполнить" />
                  <span>{t.title}</span>
                  <em className={t.due_date! < td ? "late" : ""}>{t.due_date! < td ? "просрочено" : t.due_time ? t.due_time.slice(0, 5) : ""}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="db2-card" style={{ "--c": SECTION_COLOR.chats } as React.CSSProperties}>
          <header><h2>Чаты</h2><Link href="/messages/" className="db2-all">Все</Link></header>
          {chats.length === 0 ? <div className="db2-empty"><span>✉</span><p>Пока тихо</p><Link href="/community/">Найти людей</Link></div> : (
            <ul className="db2-chats">
              {chats.slice(0, 5).map((c, i) => (
                <li key={c.chat_id} style={{ "--i": i } as React.CSSProperties}>
                  <Link href={chatHref(c.chat_id)} className={c.unread ? "new" : ""}>
                    <ChatAvatar c={c} size={36} />
                    <span className="db2-chat-t"><b>{chatTitle(c)}</b><small>{c.last_text || "Сообщение"}</small></span>
                    {c.unread > 0 && <em className="count-badge">{c.unread > 99 ? "99+" : c.unread}</em>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <nav className="db2-dock" aria-label="Быстрые переходы">
        {[
          { href: "/workspace/?tab=plans&focus=new-task", icon: "workspace", t: "Задача", c: SECTION_COLOR.workspace, n: 0 },
          { href: "/jobs/?tab=my-orders", icon: "jobs", t: "Биржа", c: SECTION_COLOR.jobs, n: responses },
          { href: "/messages/", icon: "chats", t: "Чаты", c: SECTION_COLOR.chats, n: 0 },
          { href: "/aura/?tab=shop", icon: "home", t: "Shop", c: "#FF4F8B", n: 0 },
          { href: profileHref(me.username), icon: "profile", t: "Профиль", c: SECTION_COLOR.profile, n: 0 },
        ].map((x) => (
          <Link key={x.t} href={x.href} style={{ "--c": x.c } as React.CSSProperties}>
            <span><Ico name={x.icon} />{x.n > 0 && <em>{x.n}</em>}</span>{x.t}
          </Link>
        ))}
      </nav>
    </main>
  );
}

/** Число плавно набегает от нуля */
function Count({ n }: { n: number | null }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (n === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || n === 0) { setV(n); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); setV(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{n === null ? "—" : v}</>;
}

/** Размытый баннер (или аватар) человека на весь фон — как в профиле */
function DbBackdrop({ src }: { src: string | null }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.body);
    document.documentElement.classList.add("has-xbg");
    return () => document.documentElement.classList.remove("has-xbg");
  }, []);
  if (!host) return null;
  const video = !!src && /\.(mp4|webm)(\?|$)/i.test(src);
  return createPortal(
    <div className="xbg" aria-hidden="true">
      {src ? video ? <video className="xbg-media" src={src} autoPlay muted loop playsInline /> : <img className="xbg-media" src={src} alt="" />
        : <span className="xbg-media xbg-grad" />}
      <span className="xbg-veil" />
    </div>,
    host,
  );
}
