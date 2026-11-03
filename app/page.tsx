"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { NICHES } from "@/lib/niches";
import { TIERS } from "@/lib/aura";
import { TopBar } from "./TopBar";

const BASE = process.env.NODE_ENV === "production" ? "/platform" : "";

// Фото для коллажа на первом экране: кладутся в public/photos/ (1.jpg … 6.jpg). Пока файла нет — серая плитка
const PHOTOS = [1, 2, 3, 4, 5, 6];

const MAP = [
  { href: "profile", title: "Профиль", text: "Твоя витрина: работы, проекты, отзывы. Ссылку можно отправить клиенту." },
  { href: "/workspace/", title: "Workspace", text: "Рабочее место: план дня, клиенты, проекты, деньги и заметки." },
  { href: "/learn/", title: "Обучение", text: "Короткие статьи по 10 нишам: монтаж, ИИ, дизайн и другие." },
  { href: "/community/", title: "Community", text: "Люди твоей ниши, друзья и команды под проекты." },
  { href: "/jobs/", title: "Биржа", text: "Заказы от заказчиков и бейджи специалистов." },
  { href: "/messages/", title: "Чаты", text: "Личка, группы, каналы и звонки." },
];

const STEPS = [
  { n: "1", title: "Создай аккаунт", text: "Имя, ник и ниша — минута." },
  { n: "2", title: "Заполни профиль", text: "Фото, пара слов о себе и что ищешь." },
  { n: "3", title: "Покажи работы", text: "Добавь проект и повесь бейдж на Биржу." },
  { n: "4", title: "Найди своих", text: "Пиши людям, собирай команду, бери заказы." },
];

export default function Home() {
  const { me, ready } = useSession();
  useEffect(() => { document.title = "Relic — платформа для фрилансеров"; }, []);
  const hrefOf = (h: string) => (h === "profile" ? (me ? profileHref(me.username) : "/register") : h);

  return (
    <>
      <TopBar />
      <main className="page wide hm">
        {/* Первый экран */}
        <section className="hm-hero">
          <span className="hm-kicker">Relic</span>
          <h1 className="hm-title">Работа, рост и свои люди.<br /><span>В одном спокойном месте.</span></h1>
          <p className="hm-lead">Платформа для фрилансеров: профиль, рабочее место, обучение и заказы.</p>
          <div className="hm-cta">
            {ready && me ? (
              <>
                <Link className="btn hm-btn" href={profileHref(me.username)}>Мой профиль</Link>
                <Link className="btn ghost hm-btn" href="/workspace/">Workspace</Link>
              </>
            ) : (
              <>
                <Link className="btn hm-btn" href="/register">Создать аккаунт</Link>
                <Link className="btn ghost hm-btn" href="/login">Войти</Link>
              </>
            )}
          </div>
          <div className="hm-collage" aria-hidden="true">
            {PHOTOS.map((n) => (
              <span key={n} className={`hm-ph p${n}`}>
                <img src={`${BASE}/photos/${n}.jpg`} alt="" loading="lazy" onLoad={(e) => e.currentTarget.parentElement?.classList.add("on")} />
              </span>
            ))}
            <b className="hm-stamp">relic</b>
          </div>
        </section>

        {/* Что внутри */}
        <section className="hm-sec">
          <div className="hm-sec-head"><h2>Что внутри</h2><p>Шесть разделов. Каждый — для одного дела.</p></div>
          <div className="hm-map">
            {MAP.map((m, i) => (
              <Link key={m.title} href={hrefOf(m.href)} className="hm-tile">
                <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                <b>{m.title}</b>
                <p>{m.text}</p>
                <em>Открыть</em>
              </Link>
            ))}
          </div>
        </section>

        {/* Как начать */}
        <section className="hm-sec">
          <div className="hm-sec-head"><h2>Как начать</h2><p>Четыре шага, около десяти минут.</p></div>
          <ol className="hm-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span>{s.n}</span>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* AURA */}
        <section className="hm-aura">
          <div>
            <h2>AURA — рейтинг за дела</h2>
            <p>Растёт, когда ты добавляешь работы, закрываешь цели и помогаешь другим. Купить нельзя.</p>
            <Link className="link-btn" href="/aura/">Посмотреть рейтинг</Link>
          </div>
          <ol className="hm-tiers">
            {TIERS.slice(0, 5).map((t) => <li key={t.name} style={{ "--t": t.color } as React.CSSProperties}><i /><b>{t.name}</b><span className="mono">{t.min}+</span></li>)}
          </ol>
        </section>

        {/* Ниши */}
        <section className="hm-sec">
          <div className="hm-sec-head"><h2>Для кого</h2></div>
          <div className="hm-niches">
            {NICHES.map((n) => <span key={n.id} style={{ "--c": n.color } as React.CSSProperties}><i />{n.title}</span>)}
          </div>
        </section>

        {!me && (
          <section className="hm-final">
            <h2>Начни сегодня.</h2>
            <p>Регистрация занимает минуту.</p>
            <Link className="btn hm-btn" href="/register">Создать аккаунт</Link>
          </section>
        )}

        <footer className="hm-foot">
          <span>© {new Date().getFullYear()} Relic</span>
          <Link href="/privacy/">Политика конфиденциальности</Link>
          <a href="mailto:relic_help@mail.ru">relic_help@mail.ru</a>
        </footer>
      </main>
    </>
  );
}
