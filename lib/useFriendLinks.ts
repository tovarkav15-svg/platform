"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type FriendState, type ProfileCard } from "./supabase";

type Link_ = { requester: string; addressee: string; status: string; r: ProfileCard; a: ProfileCard };

/** Все мои связи дружбы + удобные выборки */
export function useFriendLinks(meId: string | undefined) {
  const [links, setLinks] = useState<Link_[] | null>(null);

  const load = useCallback(async () => {
    if (!meId) return;
    const { data } = await supabase
      .from("friendships")
      .select(`requester, addressee, status, r:profiles!friendships_requester_fkey(${PROFILE_CARD}), a:profiles!friendships_addressee_fkey(${PROFILE_CARD})`)
      .order("created_at", { ascending: false });
    setLinks((data as unknown as Link_[]) ?? []);
  }, [meId]);

  useEffect(() => { load(); }, [load]);

  const list = links ?? [];
  const other = (l: Link_) => (l.requester === meId ? l.a : l.r);
  const stateOf = (id: string): FriendState => {
    if (id === meId) return "self";
    const l = list.find((x) => x.requester === id || x.addressee === id);
    if (!l) return "none";
    if (l.status === "accepted") return "friends";
    return l.requester === meId ? "outgoing" : "incoming";
  };

  return {
    loaded: links !== null,
    reload: load,
    stateOf,
    friends: list.filter((l) => l.status === "accepted").map(other),
    incoming: list.filter((l) => l.status === "pending" && l.addressee === meId).map((l) => l.r),
    outgoing: list.filter((l) => l.status === "pending" && l.requester === meId).map((l) => l.a),
  };
}
