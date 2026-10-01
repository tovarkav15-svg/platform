"use client";

import { useSearchParams } from "next/navigation";
import { JoinCard } from "../join/JoinCard";

// Публичная страница канала или группы по юзернейму: …/c/?u=montazh_daily
export default function ChannelPage() {
  return <JoinCard username={useSearchParams().get("u")} />;
}
