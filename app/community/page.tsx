"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import { TopBar } from "../TopBar";
import { Feed } from "./Feed";
import { People } from "./People";
import { Circle } from "./Circle";

const TABS = [
  { id: "feed", label: "Лента", sub: "Проекты и работы" },
  { id: "people", label: "Люди", sub: "Найти своих" },
  { id: "circle", label: "Мой круг", sub: "Друзья, заявки, команды" },
] as const;
type Tab = (typeof TABS)[number]["id"];

// Community: лента, люди и твой круг в одной вкладке
export default function CommunityPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const raw = sp.get("tab");
  // Старые ссылки ?tab=requests / ?tab=teams ведут в «Мой круг»
  const legacy = raw === "requests" || raw === "teams" || raw === "friends";
  const tab: Tab = legacy ? "circle" : TABS.find((t) => t.id === raw)?.id ?? prefs.communityTab;

  useEffect(() => {
    if (legacy) router.replace(`/community/?tab=circle${raw !== "friends" ? `&c=${raw}` : ""}`, { scroll: false });
  }, [legacy, raw, router]);
  useEffect(() => { document.title = `Community · ${TABS.find((t) => t.id === tab)?.label}`; }, [tab]);

  const bar = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = bar.current?.querySelector<HTMLElement>(`[data-t="${tab}"]`);
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tab]);

  return (
    <>
      <TopBar />
      <div className="dv-bg" aria-hidden="true"><i /><i /><i /></div>
      <main className="page wide cm">
        <header className="cm-head">
          <h1 className="cm-title">Community</h1>
          <nav className="cm-tabs" ref={bar} aria-label="Разделы Community">
            {pill && <span className="cm-pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />}
            {TABS.map((t) => (
              <Link key={t.id} data-t={t.id} href={`/community/?tab=${t.id}`} replace scroll={false} className="cm-tab" aria-current={tab === t.id ? "page" : undefined}>
                <b>{t.label}</b><small>{t.sub}</small>
              </Link>
            ))}
          </nav>
        </header>
        <div key={tab} className="cm-body">
          {tab === "feed" && <Feed />}
          {tab === "people" && <People />}
          {tab === "circle" && <Circle />}
        </div>
      </main>
    </>
  );
}
