import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "../TopBar";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Настройки профиля" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !me.profile) redirect("/login");
  const p = me.profile;

  return (
    <>
      <TopBar />
      <main className="page">
        <div>
          <div className="label">Настройки</div>
          <h1 className="h-xl caps">Профиль <span className="it">под</span> себя</h1>
        </div>
        <ProfileForm
          justSaved={(await searchParams).saved === "1"}
          founder={me.role === "founder"}
          initial={{
            displayName: p.displayName, username: me.username, bio: p.bio, accent: p.accent, cover: p.cover,
            avatar: p.avatar ?? "", telegram: p.telegram, website: p.website, niches: p.niches,
            earnings: p.earnings, earningsGoal: p.earningsGoal, showEarnings: p.showEarnings,
          }}
        />
        <PasswordForm />
      </main>
    </>
  );
}
