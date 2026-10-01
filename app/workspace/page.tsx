"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { Clients } from "./Clients";
import { Plans } from "./Plans";
import { Finance } from "./Finance";

type Tab = "clients" | "plans" | "finance";
const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: "clients", label: "Clients", sub: "Клиенты и сделки" },
  { id: "plans", label: "Plans", sub: "Задачи и планы" },
  { id: "finance", label: "Finance", sub: "Доходы, расходы, оплаты" },
];

export default function WorkspacePage() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const tab: Tab = (TABS.find((t) => t.id === sp.get("tab"))?.id) ?? "clients";

  useEffect(() => { document.title = `Workspace · ${TABS.find((t) => t.id === tab)!.label}`; }, [tab]);

  return (
    <>
      <TopBar />
      <main className="page wide workspace">
        <div className="section-head">
          <div>
            <div className="label">Workspace · видишь только ты</div>
            <h1 className="h-xl caps">Рабочее <span className="it">место</span></h1>
          </div>
        </div>
        <nav className="ws-tabs" aria-label="Разделы Workspace">
          {TABS.map((t) => (
            <Link key={t.id} href={`/workspace/?tab=${t.id}`} replace scroll={false} className="ws-tab" aria-current={tab === t.id ? "page" : undefined}>
              <b>{t.label}</b><span>{t.sub}</span>
            </Link>
          ))}
        </nav>
        {!me ? <div className="skeleton profile-skeleton" /> : (
          <div key={tab} className="ws-body">
            {tab === "clients" && <Clients userId={me.id} />}
            {tab === "plans" && <Plans userId={me.id} />}
            {tab === "finance" && <Finance userId={me.id} />}
          </div>
        )}
      </main>
    </>
  );
}
