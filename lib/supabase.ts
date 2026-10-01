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
  last_mine: boolean | null;
  last_at: string | null;
  unread: number;
};

export const PROFILE_CARD = "id, username, display_name, avatar, accent, niches, role";
