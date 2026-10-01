"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, PROFILE_CARD, type ProfileCard } from "@/lib/supabase";
import { useRequireMe } from "@/lib/session";
import { useFriendLinks } from "@/lib/useFriendLinks";
import { NICHES } from "@/lib/niches";
import { normalizeUsername } from "@/lib/username";
import { TopBar } from "../TopBar";
import { Empty, PeopleList } from "../PeopleList";
import { FloatingFaces, SpaceHero } from "../SpaceHero";

export default function PeoplePage() {
  const { me } = useRequireMe();
  const sp = useSearchParams();
  const router = useRouter();
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const niche = sp.get("niche") ?? "";
  const open = sp.get("open") === "1";
  const fl = useFriendLinks(me?.id);
  const [found, setFound] = useState<ProfileCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [faces, setFaces] = useState<ProfileCard[]>([]);
  const [layout, setLayout] = useState<"list" | "grid">("grid");

  useEffect(() => {
    try { const v = localStorage.getItem("people:layout"); if (v === "list" || v === "grid") setLayout(v); } catch {}
    supabase.from("profiles").select(PROFILE_CARD, { count: "exact" }).not("avatar", "is", null).limit(7)
      .then(({ data, count }) => { setFaces((data as ProfileCard[]) ?? []); if (count !== null) setTotal((t) => Math.max(t, count)); });
    supabase.from("profiles").select("id", { count: "exact", head: true }).then(({ count }) => setTotal(count ?? 0));
  }, []);
  const pickLayout = (v: "list" | "grid") => { setLayout(v); try { localStorage.setItem("people:layout", v); } catch {} };

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(niche && { niche }), ...(open && { open: "1" }) });
    for (const [k, v] of Object.entries(patch)) v ? p.set(k, v) : p.delete(k);
    const qs = p.toString();
    router.replace(`/people/${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  useEffect(() => { document.title = "Люди"; }, []);

  useEffect(() => {
    if (!me) return;
    setFound(null);
    let query = supabase.from("profiles").select(PROFILE_CARD).neq("id", me.id).order("created_at", { ascending: false }).limit(60);
    if (q) {
      const safe = q.replace(/[%,()*]/g, "");
      query = query.or(`username.ilike.%${normalizeUsername(safe)}%,display_name.ilike.%${safe}%,headline.ilike.%${safe}%,skills.ilike.%${safe}%`);
    }
    if (niche) query = query.ilike("niches", `%${niche}%`);
    if (open) query = query.eq("open_to_work", true);
    query.then(({ data }) => setFound((data as ProfileCard[]) ?? []));
  }, [me, q, niche, open]);

  return (
    <>
      <TopBar />
      <main className="page">
        <SpaceHero
          space="people" eyebrow="People · картотека"
          title={<>Кого ты <span className="it">можешь</span> найти</>}
          text="Монтажёры, продюсеры, дизайнеры, кодеры. Ищи по навыку, нише или тем, кто открыт к работе."
          art={<FloatingFaces people={faces.length ? faces : (found ?? []).slice(0, 7)} total={total} />}
        />

        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() }); }}>
          <div className="input"><input id="q" name="q" defaultValue={q} placeholder="Имя, @юзернейм, навык: Premiere, Figma…" autoComplete="off" /></div>
          <button className="btn" type="submit">Найти</button>
        </form>

        <div className="filters">
          <button type="button" className={`fchip ${!niche ? "on" : ""}`} onClick={() => go({ niche: "" })}>Все ниши</button>
          {NICHES.map((n) => (
            <button key={n.id} type="button" className={`fchip ${niche === n.id ? "on" : ""}`} style={{ "--c": n.color } as React.CSSProperties}
              onClick={() => go({ niche: niche === n.id ? "" : n.id })}>{n.title}</button>
          ))}
          <button type="button" className={`fchip otw-filter ${open ? "on" : ""}`} onClick={() => go({ open: open ? "" : "1" })}>Открыт к работе</button>
        </div>

        <div className="section-head">
          <span className="label">{found ? `Найдено: ${found.length}` : "Ищу…"}</span>
          <div className="seg small">
            <button type="button" className="seg-item" aria-current={layout === "grid" ? "page" : undefined} onClick={() => pickLayout("grid")}>Карточки</button>
            <button type="button" className="seg-item" aria-current={layout === "list" ? "page" : undefined} onClick={() => pickLayout("list")}>Список</button>
          </div>
        </div>

        {found === null || !fl.loaded ? <div className="skeleton list-skeleton" /> : found.length
          ? <PeopleList people={found} stateOf={fl.stateOf} onChange={fl.reload} layout={layout} />
          : <Empty title="Никого не нашли" text="Попробуй другое имя, навык или убери фильтры." />}
      </main>
    </>
  );
}
