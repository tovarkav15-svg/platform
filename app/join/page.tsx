"use client";

import { useSearchParams } from "next/navigation";
import { JoinCard } from "./JoinCard";

export default function JoinPage() {
  return <JoinCard code={useSearchParams().get("code")} />;
}
