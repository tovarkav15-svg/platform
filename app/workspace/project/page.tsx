"use client";

import { Suspense } from "react";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../../TopBar";
import { ProjectPage } from "./ProjectPage";

/** Отдельная страница проекта: /workspace/project/?id=… — удобно держать открытой в своём окне */
export default function Page() {
  const { me } = useRequireMe();
  return (
    <>
      <TopBar />
      <main className="pjp-wrap">
        {!me ? <div className="skeleton profile-skeleton" /> : <Suspense><ProjectPage userId={me.id} /></Suspense>}
      </main>
    </>
  );
}
