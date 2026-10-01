"use client";

import { useEffect, useState } from "react";
import { supabase, type Earnings } from "@/lib/supabase";
import { signOut, useRequireMe } from "@/lib/session";
import { useRouter } from "next/navigation";
import { TopBar } from "../TopBar";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";

export default function SettingsPage() {
  const { me, session, refreshMe } = useRequireMe();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    document.title = "Настройки профиля";
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
      <main className="page">
        <div>
          <div className="label">Настройки</div>
          <h1 className="h-xl caps">Профиль <span className="it">под</span> себя</h1>
        </div>
        {me && earnings && session ? (
          <>
            <ProfileForm
              key={me.id}
              userId={me.id}
              role={me.role}
              projects={projects}
              onSaved={refreshMe}
              initial={{
                displayName: me.display_name, username: me.username, bio: me.bio, accent: me.accent, bannerPath: me.banner_path ?? "", bannerPreset: me.banner_preset, about: me.about,
                ring: me.avatar_ring, nameStyle: me.name_style, emoji: me.emoji, pageBg: me.page_bg,
                avatar: me.avatar ?? "", telegram: me.telegram, website: me.website, niches: me.niches,
                earnings: earnings.amount, earningsGoal: earnings.goal, showEarnings: earnings.is_public,
                headline: me.headline, status: me.status, city: me.city, skills: me.skills, openToWork: me.open_to_work,
                sections: me.sections, pinnedProject: me.pinned_project ?? "",
              }}
            />
            <PasswordForm authEmail={session.user.email ?? ""} />
            <AccountBlock username={me.username} />
          </>
        ) : (
          <div className="skeleton profile-skeleton" />
        )}
      </main>
    </>
  );
}

function AccountBlock({ username }: { username: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card account-block">
      <h2 className="h-md caps">Аккаунт</h2>
      <p className="lead small">Ты вошёл как @{username}. На этом устройстве вход сохраняется, пока не выйдешь.</p>
      <div className="save-row">
        {confirm
          ? <button type="button" className="btn danger" onClick={async () => { await signOut(); router.replace("/login"); }}>Точно выйти</button>
          : <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>Выйти из аккаунта</button>}
        {confirm && <button type="button" className="link-btn" onClick={() => setConfirm(false)}>Отмена</button>}
      </div>
    </section>
  );
}
