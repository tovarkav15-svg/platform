import { supabase, type FriendState } from "./supabase";

export async function isUsernameTaken(username: string) {
  const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  return !!data;
}

export async function signUp(p: { username: string; displayName: string; email: string; password: string; niches: string[]; ref?: string | null }) {
  // Аккаунт создаётся на настоящую почту — на неё приходят письма (сброс пароля). Вход по-прежнему и по юзернейму
  return supabase.auth.signUp({
    email: p.email.trim().toLowerCase(),
    password: p.password,
    options: {
      data: { username: p.username, display_name: p.displayName, niches: p.niches.join(","), contact_email: p.email.toLowerCase(), ref: p.ref ?? "" },
    },
  });
}

export async function signIn(login: string, password: string) {
  const { data: email } = await supabase.rpc("login_email", { p_username: login });
  if (!email) return { error: "Неверный логин или пароль" };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? "Неверный логин или пароль" : null };
}

export async function friendState(meId: string, otherId: string): Promise<FriendState> {
  if (meId === otherId) return "self";
  const { data } = await supabase
    .from("friendships")
    .select("requester, status")
    .or(`and(requester.eq.${meId},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${meId})`)
    .maybeSingle();
  if (!data) return "none";
  if (data.status === "accepted") return "friends";
  return data.requester === meId ? "outgoing" : "incoming";
}

export const friendsApi = {
  send: (id: string) => supabase.rpc("send_friend_request", { p_user: id }),
  accept: (id: string) => supabase.rpc("accept_friend_request", { p_user: id }),
  remove: (id: string) => supabase.rpc("remove_friend", { p_user: id }),
};

export async function openDm(otherId: string) {
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_user: otherId });
  if (error) throw error;
  return data as string;
}
