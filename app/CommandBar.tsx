"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/lib/supabase";
import { profileHref } from "@/lib/links";

type Cmd = { t: string; s: string; href: string; k?: string };

const CREATE: Cmd[] = [
  { t: "Задачу", s: "в планы", href: "/workspace/?tab=plans&focus=new-task" },
  { t: "Клиента", s: "в базу клиентов", href: "/workspace/?tab=clients&new=1" },
  { t: "Проект", s: "с дедлайном", href: "/workspace/?tab=projects&new=1" },
  { t: "Операцию", s: "доход или расход", href: "/workspace/?tab=finance&ops=1" },
  { t: "Заметку", s: "идею или список", href: "/workspace/?tab=notes" },
  { t: "Заказ", s: "на Бирже", href: "/jobs/?tab=my-orders" },
];

/** Поиск по разделам и кнопка «Новое» в шапке: всё главное в одно нажатие, ⌘K открывает поиск */
export function CommandBar({ me }: { me: Profile }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<"" | "search" | "create">("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const all: Cmd[] = useMemo(() => [
    { t: "Обзор", s: "главное на сегодня", href: "/" },
    { t: "Чаты", s: "сообщения", href: "/messages/" },
    { t: "Люди", s: "поиск по нише и навыкам", href: "/community/?tab=people" },
    { t: "Лента", s: "проекты и работы", href: "/community/" },
    { t: "Биржа", s: "специалисты и заказы", href: "/jobs/" },
    { t: "Заказы", s: "задачи от заказчиков", href: "/jobs/?tab=orders" },
    { t: "Сделки", s: "условия и этапы", href: "/jobs/?tab=deals" },
    { t: "Workspace", s: "мои дела", href: "/workspace/" },
    { t: "План дня", s: "расписание по часам", href: "/workspace/?tab=day" },
    { t: "Задачи", s: "планы и цели", href: "/workspace/?tab=plans" },
    { t: "Клиенты", s: "база и сделки", href: "/workspace/?tab=clients" },
    { t: "Проекты", s: "дедлайны", href: "/workspace/?tab=projects" },
    { t: "Финансы", s: "доходы и расходы", href: "/workspace/?tab=finance" },
    { t: "Заметки", s: "идеи и списки", href: "/workspace/?tab=notes" },
    { t: "Обучение", s: "статьи по нишам", href: "/learn/" },
    { t: "Мой профиль", s: "витрина для клиентов", href: profileHref(me.username) },
    { t: "AURA", s: "рейтинг и магазин", href: "/aura/" },
    { t: "Настройки", s: "тема, уведомления, безопасность", href: "/settings/" },
    ...CREATE.map((c) => ({ ...c, t: `Создать ${c.t.toLowerCase()}`, s: c.s })),
  ], [me.username]);

  const found = useMemo(() => {
    const w = q.trim().toLowerCase();
    const list = w ? all.filter((c) => `${c.t} ${c.s}`.toLowerCase().includes(w)) : all.slice(0, 8);
    return w.length >= 2 ? [...list, { t: `Найти людей: «${q.trim()}»`, s: "по имени, нише, навыкам", href: `/community/?tab=people&q=${encodeURIComponent(q.trim())}` }] : list;
  }, [q, all]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => (o === "search" ? "" : "search")); }
      else if (e.key === "Escape") setOpen("");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { setOpen(""); }, [path]);
  useEffect(() => { if (open === "search") { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 20); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(""); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!mounted) return null;

  const go = (href: string) => { setOpen(""); router.push(href); };

  return (
    <div className="cb" ref={box}>
      {open === "search" && (
        <div className="cb-pop cb-search" role="dialog" aria-label="Поиск и команды">
          <input ref={input} value={q} placeholder="Куда перейти или что сделать?" onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(found.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
              else if (e.key === "Enter" && found[sel]) go(found[sel].href);
            }} />
          <ul>
            {found.map((c, i) => (
              <li key={c.href + c.t}>
                <button type="button" className={i === sel ? "on" : ""} onMouseEnter={() => setSel(i)} onClick={() => go(c.href)}>
                  <b>{c.t}</b><small>{c.s}</small>
                </button>
              </li>
            ))}
            {found.length === 0 && <li className="cb-none">Ничего не нашли</li>}
          </ul>
        </div>
      )}
      {open === "create" && (
        <div className="cb-pop cb-create" role="menu">
          {CREATE.map((c) => (
            <Link key={c.t} role="menuitem" href={c.href} onClick={() => setOpen("")}><b>{c.t}</b><small>{c.s}</small></Link>
          ))}
        </div>
      )}
      <button type="button" className="cb-find" onClick={() => setOpen(open === "search" ? "" : "search")} aria-expanded={open === "search"}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <span>Найти в Relic</span>
        <kbd>⌘K</kbd>
      </button>
      <button type="button" className="cb-new" onClick={() => setOpen(open === "create" ? "" : "create")} aria-expanded={open === "create"}>
        <span aria-hidden="true">+</span> Новое
      </button>
    </div>
  );
}
