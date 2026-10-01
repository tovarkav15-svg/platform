"use client";

import { useEffect } from "react";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { GoalsBoard } from "./GoalsBoard";

export default function GoalsPage() {
  const { me } = useRequireMe();
  useEffect(() => { document.title = "Цели и задачи"; }, []);

  return (
    <>
      <TopBar />
      <main className="page">
        <div>
          <div className="label">Goals / Tasks</div>
          <h1 className="h-xl caps">Что тебе <span className="it">нужно</span> сделать</h1>
        </div>
        {me ? <GoalsBoard userId={me.id} editable /> : <div className="skeleton profile-skeleton" />}
      </main>
    </>
  );
}
