"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type Project, type ProfileCard, type Work } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { TopBar } from "../TopBar";
import { ProjectCard, WorkCard } from "../Cards";

type Kind = "all" | "projects" | "work";
type Item = { type: "project"; at: string; project: Project; author: ProfileCard } | { type: "work"; at: string; work: Work; author: ProfileCard };

export default function DiscoverPage() {
  const { ready, me } = useSession();
  const sp = useSearchParams();
  const router = useRouter();
  const kind: Kind = sp.get("kind") === "projects" || sp.get("kind") === "work" ? (sp.get("kind") as Kind) : "all";
  const niche = sp.get("niche") ?? "";
  const lookingOnly = sp.get("looking") === "1";
  const [items, setItems] = useState<Item[] | null>(null);

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(kind !== "all" && { kind }), ...(niche && { niche }), ...(lookingOnly && { looking: "1" }) });
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    const qs = p.toString();
    router.replace(`/discover/${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  useEffect(() => { document.title = "Discover"; }, []);

  useEffect(() => {
    if (!ready) return;
    setItems(null);
    (async () => {
      let pq = supabase.from("projects").select(`*, author:profiles!projects_user_id_fkey(${PROFILE_CARD})`).order("updated_at", { ascending: false }).limit(40);
      let wq = supabase.from("works").select(`*, author:profiles!works_user_id_fkey(${PROFILE_CARD})`).order("created_at", { ascending: false }).limit(40);
      if (niche) { pq = pq.eq("niche", niche); wq = wq.eq("niche", niche); }
      if (lookingOnly) pq = pq.neq("looking_for", "");
      const [p, w] = await Promise.all([
        kind === "work" ? Promise.resolve({ data: [] }) : pq,
        kind === "projects" || lookingOnly ? Promise.resolve({ data: [] }) : wq,
      ]);
      const list: Item[] = [
        ...((p.data as unknown as (Project & { author: ProfileCard })[]) ?? []).map(({ author, ...project }) => ({ type: "project" as const, at: project.updated_at, project, author })),
        ...((w.data as unknown as (Work & { author: ProfileCard })[]) ?? []).map(({ author, ...work }) => ({ type: "work" as const, at: work.created_at, work, author })),
      ].sort((a, b) => b.at.localeCompare(a.at));
      setItems(list);
    })();
  }, [ready, kind, niche, lookingOnly]);

  return (
    <>
      <TopBar />
      <main className="page wide">
        <div className="section-head">
          <div>
            <div className="label">Discover</div>
            <h1 className="h-xl caps">Что <span className="it">строят</span> другие</h1>
          </div>
          {me && <Link className="btn" href={`/u/?n=${me.username}&tab=projects`}>Показать своё</Link>}
        </div>

        <nav className="seg" aria-label="Что показывать">
          {([["all", "Всё"], ["projects", "Проекты"], ["work", "Proof of Work"]] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" className="seg-item" aria-current={kind === k ? "page" : undefined} onClick={() => go({ kind: k === "all" ? "" : k })}>{label}</button>
          ))}
        </nav>

        <div className="filters">
          <button type="button" className={`fchip ${!niche ? "on" : ""}`} onClick={() => go({ niche: "" })}>Все ниши</button>
          {NICHES.map((n) => (
            <button key={n.id} type="button" className={`fchip ${niche === n.id ? "on" : ""}`} style={{ "--c": n.color } as React.CSSProperties}
              onClick={() => go({ niche: niche === n.id ? "" : n.id })}>{n.title}</button>
          ))}
          {kind !== "work" && (
            <button type="button" className={`fchip otw-filter ${lookingOnly ? "on" : ""}`} onClick={() => go({ looking: lookingOnly ? "" : "1" })}>Ищут людей</button>
          )}
        </div>

        {items === null ? <div className="skeleton profile-skeleton" /> : items.length ? (
          <div className="pgrid feed">
            {items.map((it, i) => it.type === "project"
              ? <ProjectCard key={`p-${it.project.id}`} project={it.project} author={it.author} i={i} />
              : <WorkCard key={`w-${it.work.id}`} work={it.work} author={it.author} i={i} />)}
          </div>
        ) : (
          <div className="empty">
            <b className="caps">Здесь пока пусто</b>
            <p className="lead">Стань первым: добавь проект или работу в свой профиль, и они появятся в Discover.</p>
            {me && <Link className="btn" href={`/u/?n=${me.username}&tab=projects`}>Добавить проект</Link>}
          </div>
        )}
      </main>
    </>
  );
}
