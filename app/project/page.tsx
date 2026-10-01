"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase, publicMedia, STAGES, PROFILE_CARD, type Project, type ProfileCard } from "@/lib/supabase";
import { openDm } from "@/lib/api";
import { useSession } from "@/lib/session";
import { NICHES } from "@/lib/niches";
import { chatHref, profileHref } from "@/lib/links";
import { TopBar } from "../TopBar";
import { Avatar } from "../Avatar";
import { RoleBadge } from "../ProfileHeader";
import { ProjectEditor } from "./ProjectEditor";

type Member = { user_id: string; role: string; p: ProfileCard };

export default function ProjectPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { ready, me, refreshMe } = useSession();
  const [project, setProject] = useState<Project | null | "missing">(null);
  const [author, setAuthor] = useState<ProfileCard | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [friends, setFriends] = useState<ProfileCard[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data: p } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (!p) return setProject("missing");
    setProject(p as Project);
    const [{ data: a }, { data: m }] = await Promise.all([
      supabase.from("profiles").select(PROFILE_CARD).eq("id", p.user_id).single(),
      supabase.from("project_members").select(`user_id, role, p:profiles(${PROFILE_CARD})`).eq("project_id", id).order("added_at"),
    ]);
    setAuthor(a as ProfileCard);
    setMembers((m as unknown as Member[]) ?? []);
    document.title = p.name;
  }, [id]);

  useEffect(() => { if (ready && id) load(); else if (ready) setProject("missing"); }, [ready, id, load]);

  const isAuthor = !!me && project !== null && project !== "missing" && project.user_id === me.id;

  // Автору — список друзей, чтобы добавить в команду
  useEffect(() => {
    if (!isAuthor || !me) return;
    supabase
      .from("friendships")
      .select(`requester, addressee, r:profiles!friendships_requester_fkey(${PROFILE_CARD}), a:profiles!friendships_addressee_fkey(${PROFILE_CARD})`)
      .eq("status", "accepted")
      .then(({ data }) => {
        const list = ((data as unknown as { requester: string; r: ProfileCard; a: ProfileCard }[]) ?? []).map((l) => (l.requester === me.id ? l.a : l.r));
        setFriends(list);
      });
  }, [isAuthor, me]);

  if (project === null) return (<><TopBar /><main className="page"><div className="skeleton profile-skeleton" /></main></>);
  if (project === "missing") return (
    <><TopBar /><main className="page"><div className="empty"><b className="caps">Проект не найден</b><Link className="btn" href="/discover/">В Discover</Link></div></main></>
  );

  const n = NICHES.find((x) => x.id === project.niche);
  const img = publicMedia(project.image_path);
  const memberIds = new Set(members.map((m) => m.user_id));
  const isPinned = me?.pinned_project === project.id;

  return (
    <>
      <TopBar />
      <main className="page">
        <section className="project-hero" style={{ "--c": n?.color ?? "var(--ink)" } as React.CSSProperties}>
          {img && <img src={img} alt="" className="project-cover" />}
          <div className="project-hero-text">
            <div className="tags">
              <span className={`stage stage-${project.stage}`}>{STAGES[project.stage]}</span>
              {n && <span className="tag" style={{ "--c": n.color } as React.CSSProperties}>{n.title}</span>}
            </div>
            <h1 className="h-xl caps">{project.name}</h1>
            {project.tagline && <p className="lead">{project.tagline}</p>}
            <div className="friend-actions">
              {isAuthor ? (
                <>
                  <button type="button" className="btn" onClick={() => setEditing(true)}>Изменить</button>
                  <button type="button" className="btn ghost" onClick={async () => {
                    await supabase.from("profiles").update({ pinned_project: isPinned ? null : project.id }).eq("id", me!.id);
                    refreshMe();
                  }}>{isPinned ? "Открепить из профиля" : "Закрепить в профиле"}</button>
                </>
              ) : me && author ? (
                <button type="button" className="btn" onClick={async () => router.push(chatHref(await openDm(author.id)))}>Написать автору</button>
              ) : null}
              {project.link && <a className="btn ghost" href={project.link} target="_blank" rel="noopener noreferrer nofollow">Открыть сайт</a>}
            </div>
          </div>
        </section>

        <div className="profile-layout">
          <section className="profile-main">
            {project.description && (
              <section className="card">
                <div className="label">О проекте</div>
                <p className="prose">{project.description}</p>
              </section>
            )}
            {project.looking_for && (
              <section className="card looking-card">
                <div className="label">Кого ищем</div>
                <p className="prose">{project.looking_for}</p>
                {me && !isAuthor && author && (
                  <button type="button" className="btn sm" onClick={async () => router.push(chatHref(await openDm(author.id)))}>Откликнуться</button>
                )}
              </section>
            )}
          </section>

          <aside className="profile-side">
            <section className="card">
              <div className="label">Команда</div>
              <ul className="team">
                {author && (
                  <li>
                    <Link href={profileHref(author.username)} className="team-person">
                      <Avatar name={author.display_name} avatar={author.avatar} accent={author.accent} size={36} />
                      <span><b>{author.display_name}<RoleBadge role={author.role} small /></b><small>Автор</small></span>
                    </Link>
                  </li>
                )}
                {members.map((m) => (
                  <li key={m.user_id}>
                    <Link href={profileHref(m.p.username)} className="team-person">
                      <Avatar name={m.p.display_name} avatar={m.p.avatar} accent={m.p.accent} size={36} />
                      <span><b>{m.p.display_name}</b><small>{m.role || "В команде"}</small></span>
                    </Link>
                    {(isAuthor || m.user_id === me?.id) && (
                      <button type="button" className="icon-btn sm" aria-label="Убрать из команды"
                        onClick={async () => { await supabase.from("project_members").delete().eq("project_id", project.id).eq("user_id", m.user_id); load(); }}>×</button>
                    )}
                  </li>
                ))}
              </ul>
              {isAuthor && <AddMember projectId={project.id} candidates={friends.filter((f) => !memberIds.has(f.id))} onAdded={load} />}
            </section>
          </aside>
        </div>

        {isAuthor && me && (
          <ProjectEditor open={editing} onClose={() => setEditing(false)} userId={me.id} project={project}
            onSaved={(newId) => { if (newId) load(); else router.replace(profileHref(me.username, "projects")); }} />
        )}
      </main>
    </>
  );
}

function AddMember({ projectId, candidates, onAdded }: { projectId: string; candidates: ProfileCard[]; onAdded: () => void }) {
  const [user, setUser] = useState("");
  const [role, setRole] = useState("");
  if (!candidates.length) return <p className="hint">В команду можно добавить друзей. Добавь людей в Community.</p>;
  return (
    <form className="add-member" onSubmit={async (e) => {
      e.preventDefault();
      if (!user) return;
      await supabase.from("project_members").insert({ project_id: projectId, user_id: user, role: role.trim() });
      setUser(""); setRole("");
      onAdded();
    }}>
      <div className="input">
        <select id="memberUser" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Кого добавить">
          <option value="">Добавить из друзей</option>
          {candidates.map((c) => <option key={c.id} value={c.id}>{c.display_name} (@{c.username})</option>)}
        </select>
      </div>
      <div className="input"><input id="memberRole" value={role} onChange={(e) => setRole(e.target.value)} maxLength={40} placeholder="Роль: монтаж, дизайн…" /></div>
      <button className="btn sm" type="submit" disabled={!user}>Добавить</button>
    </form>
  );
}
