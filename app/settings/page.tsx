"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, type Earnings } from "@/lib/supabase";
import { signOut, useRequireMe } from "@/lib/session";
import { profileHref } from "@/lib/links";
import { savePrefs, usePrefs, type Prefs } from "@/lib/prefs";
import { TopBar } from "../TopBar";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";

const SECTIONS = [
  { id: "general", label: "Внешний вид", sub: "Тема, текст, анимации", icon: "◐" },
  { id: "notify", label: "Уведомления", sub: "Всплывашки и звук", icon: "◉" },
  { id: "chats", label: "Чаты", sub: "Как отправлять сообщения", icon: "✉" },
  { id: "privacy", label: "Приватность", sub: "Статус в сети, доход", icon: "◍" },
  { id: "profile", label: "Профиль", sub: "Имя, фото, баннер, ниши", icon: "☺" },
  { id: "security", label: "Безопасность", sub: "Пароль", icon: "⚿" },
  { id: "account", label: "Аккаунт", sub: "Выход", icon: "⏻" },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  const { me, session, refreshMe } = useRequireMe();
  const sp = useSearchParams();
  const router = useRouter();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [hash, setHash] = useState(false);
  useEffect(() => { setHash(!!window.location.hash); }, []);
  const s: Section = SECTIONS.find((x) => x.id === sp.get("s"))?.id ?? (hash ? "profile" : "general");
  const go = (id: Section) => router.replace(id === "general" ? "/settings/" : `/settings/?s=${id}`, { scroll: false });

  useEffect(() => {
    document.title = "Settings";
    if (!me) return;
    supabase.from("projects").select("id, name").eq("user_id", me.id).order("updated_at", { ascending: false })
      .then(({ data }) => setProjects(data ?? []));
    supabase.from("earnings").select("*").eq("user_id", me.id).maybeSingle().then(({ data }) => {
      setEarnings((data as Earnings) ?? { user_id: me.id, amount: 0, goal: 0, is_public: false });
    });
  }, [me]);

  return (
    <>
      <TopBar />
      <main className="page wide st">
        <header className="st-head">
          <span className="label">Settings</span>
          <h1 className="st-title">Настройки</h1>
        </header>
        <div className="st-layout">
          <nav className="st-nav" aria-label="Разделы настроек">
            {SECTIONS.map((x) => (
              <button key={x.id} type="button" className="st-link" aria-current={s === x.id ? "page" : undefined} onClick={() => go(x.id)}>
                <i aria-hidden="true">{x.icon}</i>
                <span><b>{x.label}</b><small>{x.sub}</small></span>
              </button>
            ))}
            {me && <Link href={profileHref(me.username)} className="st-back">Мой профиль →</Link>}
          </nav>

          <section className="st-body" key={s}>
            {s === "general" && <General />}
            {s === "notify" && <Notify />}
            {s === "chats" && <Chats />}
            {s === "privacy" && <Privacy earnings={earnings} onEarnings={setEarnings} />}
            {s === "profile" && (me && earnings ? (
              <ProfileForm
                key={me.id} userId={me.id} role={me.role} projects={projects} onSaved={refreshMe}
                initial={{
                  displayName: me.display_name, username: me.username, bio: me.bio, accent: me.accent, bannerPath: me.banner_path ?? "", bannerPreset: me.banner_preset, about: me.about,
                  ring: me.avatar_ring, nameStyle: me.name_style, emoji: me.emoji, pageBg: me.page_bg, lookingFor: me.looking_for ?? "",
                  avatar: me.avatar ?? "", telegram: me.telegram, website: me.website, niches: me.niches,
                  earnings: earnings.amount, earningsGoal: earnings.goal, showEarnings: earnings.is_public,
                  headline: me.headline, status: me.status, city: me.city, skills: me.skills, openToWork: me.open_to_work,
                  sections: me.sections, pinnedProject: me.pinned_project ?? "",
                }}
              />
            ) : <div className="skeleton profile-skeleton" />)}
            {s === "security" && (session ? <PasswordForm authEmail={session.user.email ?? ""} /> : <div className="skeleton list-skeleton" />)}
            {s === "account" && me && <AccountBlock username={me.username} />}
          </section>
        </div>
      </main>
    </>
  );
}

/** Карточка-группа настроек */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="st-group">
      <div className="st-group-head"><b>{title}</b>{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  );
}

function usePref<K extends keyof Prefs>(k: K): [Prefs[K], (v: Prefs[K]) => void] {
  const p = usePrefs();
  return [p[k], (v) => savePrefs({ ...p, [k]: v })];
}

function Toggle({ k, label, sub }: { k: "popups" | "sound" | "showOnline" | "enterSend"; label: string; sub?: string }) {
  const [v, set] = usePref(k);
  return (
    <label className="st-row">
      <span><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <input type="checkbox" checked={v} onChange={() => set(!v)} />
      <span className="pp-switch" aria-hidden="true" />
    </label>
  );
}

const THEMES: { id: Prefs["theme"]; label: string; sub: string }[] = [
  { id: "light", label: "Светлая", sub: "Белая, как задумано" },
  { id: "dark", label: "Тёмная", sub: "Для вечера и ночи" },
  { id: "system", label: "Как в системе", sub: "Сама переключается" },
  { id: "warm", label: "Тёплая", sub: "Мягче для глаз" },
];

function General() {
  const [theme, setTheme] = usePref("theme");
  const [text, setText] = usePref("text");
  const [motion, setMotion] = usePref("motion");
  return (
    <>
      <Group title="Тема" hint="Сохраняется на этом устройстве">
        <div className="st-themes">
          {THEMES.map((t) => (
            <button key={t.id} type="button" className={`st-theme th-${t.id}`} aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
              <span className="st-theme-art" aria-hidden="true"><i /><i /><i /></span>
              <b>{t.label}</b><small>{t.sub}</small>
            </button>
          ))}
        </div>
      </Group>
      <Group title="Размер текста">
        <div className="st-seg">
          {([["sm", "Мельче"], ["md", "Обычный"], ["lg", "Крупнее"]] as const).map(([id, l]) => (
            <button key={id} type="button" aria-pressed={text === id} onClick={() => setText(id)} className={`st-seg-${id}`}>Аа<small>{l}</small></button>
          ))}
        </div>
      </Group>
      <Group title="Анимации" hint="Если от движения устают глаза или тормозит ноутбук">
        <div className="st-seg">
          <button type="button" aria-pressed={motion === "full"} onClick={() => setMotion("full")}>Все<small>как задумано</small></button>
          <button type="button" aria-pressed={motion === "reduce"} onClick={() => setMotion("reduce")}>Минимум<small>без движения</small></button>
        </div>
      </Group>
    </>
  );
}

function Notify() {
  return (
    <Group title="Новые сообщения" hint="В режиме фокуса уведомлений нет в любом случае">
      <Toggle k="popups" label="Всплывающие уведомления" sub="Карточка в углу экрана, когда тебе пишут" />
      <Toggle k="sound" label="Звук" sub="Тихий «тук» при новом сообщении" />
    </Group>
  );
}

function Chats() {
  return (
    <Group title="Отправка сообщений">
      <Toggle k="enterSend" label="Отправлять по Enter" sub="Выключи, чтобы Enter переносил строку, а отправка была по Ctrl/⌘ + Enter" />
    </Group>
  );
}

function Privacy({ earnings, onEarnings }: { earnings: Earnings | null; onEarnings: (e: Earnings) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Group title="Статус в сети">
        <Toggle k="showOnline" label="Показывать, что я в сети" sub="Если выключить, для других ты будешь «спит»" />
      </Group>
      {earnings && (
        <Group title="Доход в профиле">
          <label className="st-row">
            <span><b>Показывать сумму всем</b><small>{earnings.is_public ? "Сейчас видят все, кто открыл профиль" : "Сейчас видишь только ты"}</small></span>
            <input type="checkbox" checked={earnings.is_public} disabled={busy} onChange={async () => {
              setBusy(true);
              const next = { ...earnings, is_public: !earnings.is_public };
              const { error } = await supabase.from("earnings").update({ is_public: next.is_public }).eq("user_id", next.user_id);
              if (!error) onEarnings(next);
              setBusy(false);
            }} />
            <span className="pp-switch" aria-hidden="true" />
          </label>
        </Group>
      )}
    </>
  );
}

function AccountBlock({ username }: { username: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <Group title="Аккаунт">
      <p className="st-note">Ты вошёл как @{username}. На этом устройстве вход сохраняется, пока не выйдешь.</p>
      <div className="save-row">
        {confirm
          ? <button type="button" className="btn danger" onClick={async () => { await signOut(); router.replace("/login"); }}>Точно выйти</button>
          : <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>Выйти из аккаунта</button>}
        {confirm && <button type="button" className="link-btn" onClick={() => setConfirm(false)}>Отмена</button>}
      </div>
    </Group>
  );
}
