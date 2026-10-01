"use client";

import { useEffect, useState } from "react";
import { supabase, type Earnings } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";

export default function SettingsPage() {
  const { me, session, refreshMe } = useRequireMe();
  const [earnings, setEarnings] = useState<Earnings | null>(null);

  useEffect(() => {
    document.title = "Настройки профиля";
    if (!me) return;
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
              founder={me.role === "founder"}
              onSaved={refreshMe}
              initial={{
                displayName: me.display_name, username: me.username, bio: me.bio, accent: me.accent, cover: me.cover,
                avatar: me.avatar ?? "", telegram: me.telegram, website: me.website, niches: me.niches,
                earnings: earnings.amount, earningsGoal: earnings.goal, showEarnings: earnings.is_public,
              }}
            />
            <PasswordForm authEmail={session.user.email ?? ""} />
          </>
        ) : (
          <div className="skeleton profile-skeleton" />
        )}
      </main>
    </>
  );
}
