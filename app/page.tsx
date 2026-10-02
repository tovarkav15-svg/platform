"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { NICHES } from "@/lib/niches";
import { TIERS } from "@/lib/aura";
import { TopBar } from "./TopBar";

const PILLARS = [
  { icon: "↗", title: "Расти", text: "Обучение по 9 нишам, цели и задачи, AURA за реальные дела. Видно, как ты движешься.", color: "#7B61FF" },
  { icon: "◆", title: "Зарабатывай", text: "Workspace для клиентов, денег и планов. Бейдж на Бирже, отзывы и портфолио, которое продаёт.", color: "#E8B100" },
  { icon: "◎", title: "Будь среди своих", text: "Люди твоей ниши, команды под проекты, чаты, каналы и звонки. Без шума соцсетей.", color: "#1FA67A" },
];

const MAP = [
  { href: "profile", title: "Профиль", text: "Твоя витрина: работы с цифрами, проекты, цели, отзывы и AURA. Ссылку можно кидать клиентам.", icon: "☺", color: "#FF6A3D" },
  { href: "/workspace/", title: "Workspace", text: "Закрытое рабочее место: клиенты в таблице и воронке, планы как в TickTick, финансы, заметки.", icon: "▦", color: "#2F7BFF" },
  { href: "/learn/", title: "Обучение", text: "Статьи по нишам от команды: монтаж, вайбкодинг, ИИ, продюсирование и другие.", icon: "✎", color: "#7B61FF" },
  { href: "/community/", title: "Community", text: "Лента проектов и работ, поиск людей по нише и навыкам, твой круг: друзья, заявки, команды.", icon: "◎", color: "#1FA67A" },
  { href: "/jobs/", title: "Биржа", text: "Бейдж специалиста: услуга, средний чек, кейсы. Проходит проверку и попадает к заказчикам.", icon: "◈", color: "#E8B100" },
  { href: "/aura/", title: "AURA", text: "Рейтинг за дела: лидерборд, задания и AURA Shop, где за Coins покупается декор профиля.", icon: "✦", color: "#FF4F8B" },
  { href: "/messages/", title: "Чаты", text: "Личка, группы, каналы, голосовые, звонки с показом экрана, стикеры и поддержка.", icon: "✉", color: "#0EA5B7" },
  { href: "/settings/", title: "Settings", text: "Тема (светлая, тёмная, тёплая), уведомления, приватность и всё про твой аккаунт.", icon: "⚙", color: "#141414" },
];

const STEPS = [
  { n: "01", title: "Создай аккаунт", text: "Минута: имя, юзернейм, ниши. Сразу получишь 100 Coins." },
  { n: "02", title: "Заполни профиль", text: "Аватар, баннер, «о себе», «ищу» — это уже +90 AURA." },
  { n: "03", title: "Покажи, что умеешь", text: "Добавь работу в Proof of Work и повесь бейдж на Биржу." },
  { n: "04", title: "Находи своих", text: "Пиши людям своей ниши, собирай команду, бери заказы." },
];

export default function Home() {
  const { me, ready } = useSession();
  useEffect(() => { document.title = "Relic — платформа для фрилансеров"; }, []);
  const hrefOf = (h: string) => (h === "profile" ? (me ? profileHref(me.username) : "/register") : h);

  return (
    <>
      <TopBar />
      <div className="rg-bg" aria-hidden="true"><i /><i /><i /></div>
      <main className="page wide hm">
        {/* Первый экран */}
        <section className="hm-hero">
          <div className="hm-hero-text">
            <span className="hm-kicker"><i />Relic · для фрилансеров и тех, кто растёт</span>
            <h1 className="hm-title">Расти, работай и&nbsp;находи <span className="hm-grad">своих людей</span> в&nbsp;одном месте</h1>
            <p className="hm-lead">Профиль, который продаёт. Workspace для клиентов и денег. Обучение по нишам, биржа, чаты и рейтинг AURA за реальные дела.</p>
            <div className="hm-cta">
              {ready && me ? (
                <>
                  <Link className="btn hm-btn" href={profileHref(me.username)}>Мой профиль</Link>
                  <Link className="btn ghost hm-btn" href="/workspace/">Открыть Workspace</Link>
                </>
              ) : (
                <>
                  <Link className="btn hm-btn" href="/register">Создать аккаунт</Link>
                  <Link className="btn ghost hm-btn" href="/login">Войти</Link>
                </>
              )}
            </div>
            {me && <p className="hm-hello">С возвращением, {me.display_name} 👋</p>}
          </div>
          <div className="hm-art" aria-hidden="true">
            <div className="hm-card c1">
              <span className="hm-ava">R</span>
              <b>Твой профиль</b><small>@username · Монтаж</small>
              <span className="hm-tags"><i style={{ background: "#FF6A3D" }} /><i style={{ background: "#7B61FF" }} /><i style={{ background: "#E8B100" }} /></span>
            </div>
            <div className="hm-card c2"><small>AURA · Сияние</small><b className="mono">312</b><span className="hm-bar"><i /></span></div>
            <div className="hm-card c3"><span className="hm-dot" /> <b>Назар</b><small>Посмотрел твой проект, давай созвонимся?</small></div>
            <div className="hm-card c4"><small>Средний чек</small><b className="mono">40 000 ₽</b><em>★ 4.9 · 12 отзывов</em></div>
            <span className="hm-ring" />
          </div>
        </section>

        {/* Концепт */}
        <section className="hm-sec">
          <div className="hm-sec-head"><span className="label">Концепт</span><h2>Три вещи, ради которых Relic</h2></div>
          <div className="hm-pillars">
            {PILLARS.map((p, i) => (
              <article key={p.title} className="hm-pillar" style={{ "--c": p.color, "--i": i } as React.CSSProperties}>
                <span className="hm-pillar-ico">{p.icon}</span>
                <b>{p.title}</b>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Навигация */}
        <section className="hm-sec">
          <div className="hm-sec-head"><span className="label">Навигация</span><h2>Что где находится</h2><p>Все разделы — в верхнем меню. Вот что внутри каждого.</p></div>
          <div className="hm-map">
            {MAP.map((m, i) => (
              <Link key={m.title} href={hrefOf(m.href)} className="hm-tile" style={{ "--c": m.color, "--i": i } as React.CSSProperties}>
                <span className="hm-tile-ico">{m.icon}</span>
                <b>{m.title}</b>
                <p>{m.text}</p>
                <em>Открыть →</em>
              </Link>
            ))}
          </div>
        </section>

        {/* Как начать */}
        <section className="hm-sec">
          <div className="hm-sec-head"><span className="label">Старт</span><h2>Как начать за 10 минут</h2></div>
          <ol className="hm-steps">
            {STEPS.map((s, i) => (
              <li key={s.n} style={{ "--i": i } as React.CSSProperties}>
                <span className="mono">{s.n}</span>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* AURA */}
        <section className="hm-aura">
          <div>
            <span className="label">AURA</span>
            <h2>Репутация, которую нельзя купить</h2>
            <p>AURA растёт за работы, проекты, покорённые цели, друзей и активность. За каждый уровень — Coins на декор профиля в AURA Shop: живые баннеры, ауры аватара, титулы.</p>
            <Link className="link-btn" href="/aura/">Лидерборд и задания →</Link>
          </div>
          <ol className="hm-tiers">
            {TIERS.map((t, i) => <li key={t.name} style={{ "--t": t.color, "--i": i } as React.CSSProperties}><i /><b>{t.name}</b><span className="mono">{t.min}+</span></li>)}
          </ol>
        </section>

        {/* Ниши */}
        <section className="hm-sec">
          <div className="hm-sec-head"><span className="label">Ниши</span><h2>Для кого Relic</h2></div>
          <div className="hm-niches">
            {NICHES.map((n, i) => <span key={n.id} style={{ "--c": n.color, "--i": i } as React.CSSProperties}><i />{n.title}</span>)}
          </div>
        </section>

        {!me && (
          <section className="hm-final">
            <h2>Начни сегодня, а не с понедельника</h2>
            <p>Регистрация — минута. 100 Coins на старте.</p>
            <Link className="btn hm-btn" href="/register">Создать аккаунт</Link>
          </section>
        )}
      </main>
    </>
  );
}
