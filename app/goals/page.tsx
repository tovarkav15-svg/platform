"use client";

import { useEffect } from "react";
import { useRequireMe } from "@/lib/session";
import { TopBar } from "../TopBar";
import { GoalsBoard } from "./GoalsBoard";
import { Mountain, SpaceHero } from "../SpaceHero";

export default function GoalsPage() {
  const { me } = useRequireMe();
  useEffect(() => { document.title = "Цели и задачи"; }, []);

  return (
    <>
      <TopBar />
      <main className="page">
        <SpaceHero
          space="goals" eyebrow="Goals / Tasks · маршрут"
          title={<>Что тебе <span className="it">нужно</span> сделать</>}
          text="Большая цель как вершина, задачи как шаги к ней. Отмечай шаги, и маршрут идёт вверх."
          art={<Mountain />}
        />
        {me ? <GoalsBoard userId={me.id} editable /> : <div className="skeleton profile-skeleton" />}
      </main>
    </>
  );
}
