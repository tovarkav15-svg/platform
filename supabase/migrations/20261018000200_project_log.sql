-- Журнал проекта в My Projects: что сделано, что надо, заметки, проблемы. Видит только автор
create table if not exists public.ws_project_log (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ws_projects(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind       text not null default 'done' check (kind in ('done', 'todo', 'note', 'issue')),
  text       text not null check (char_length(trim(text)) between 1 and 4000),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ws_project_log_project on public.ws_project_log(project_id, created_at desc);

alter table public.ws_project_log enable row level security;
drop policy if exists "ws_project_log: только свои" on public.ws_project_log;
create policy "ws_project_log: только свои" on public.ws_project_log for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.ws_projects p where p.id = project_id and p.user_id = auth.uid()));

drop trigger if exists ws_project_log_deny_banned on public.ws_project_log;
create trigger ws_project_log_deny_banned before insert or update on public.ws_project_log for each row execute function public.deny_banned();
