import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  niches: string;
  accent: string;
  cover: string;
  avatar: string | null;
  telegram: string;
  website: string;
  role: string;
  created_at: string;
  headline: string;
  status: string;
  city: string;
  skills: string;
  open_to_work: boolean;
  sections: string;
  pinned_project: string | null;
};

export type Earnings = { user_id: string; amount: number; goal: number; is_public: boolean };

export type FriendState = "none" | "friends" | "outgoing" | "incoming" | "self";

export type ChatListItem = {
  chat_id: string;
  other_id: string;
  other_username: string;
  other_name: string;
  other_avatar: string | null;
  other_accent: string;
  last_text: string | null;
  last_kind: string | null;
  last_mine: boolean | null;
  last_at: string | null;
  unread: number;
};

export type Work = {
  id: string; user_id: string; title: string; description: string; result: string;
  niche: string; link: string; image_path: string | null; created_at: string;
};

export type Stage = "idea" | "building" | "launched" | "scaling";
export type Project = {
  id: string; user_id: string; name: string; tagline: string; description: string; stage: Stage;
  niche: string; link: string; looking_for: string; image_path: string | null; created_at: string; updated_at: string;
};

export type Goal = { id: string; user_id: string; title: string; due_date: string | null; is_public: boolean; done: boolean; created_at: string };
export type Task = { id: string; user_id: string; goal_id: string | null; title: string; due_date: string | null; done: boolean; created_at: string };

export const PROFILE_CARD = "id, username, display_name, avatar, accent, niches, role, headline, open_to_work, city, skills";
export type ProfileCard = Pick<Profile, "id" | "username" | "display_name" | "avatar" | "accent" | "niches" | "role" | "headline" | "open_to_work" | "city" | "skills">;

export const STAGES: Record<Stage, string> = {
  idea: "Идея",
  building: "Строю",
  launched: "Запущен",
  scaling: "Масштабирую",
};

/** Публичная ссылка на картинку работы или проекта */
export const publicMedia = (path: string | null) =>
  path ? supabase.storage.from("public-media").getPublicUrl(path).data.publicUrl : null;

export const isOwner = (role?: string) => role === "owner" || role === "founder";
