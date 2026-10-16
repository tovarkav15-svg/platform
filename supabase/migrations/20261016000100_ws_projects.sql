-- My Projects в Workspace: проекты с дедлайнами, этапами и бюджетом. Видит только автор
create table if not exists public.ws_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 120),
  client      text not null default '' check (char_length(client) <= 120),
  description text not null default '' check (char_length(description) <= 5000),
  status      text not null default 'idea' check (status in ('idea', 'active', 'review', 'done', 'paused')),
  priority    smallint not null default 0 check (priority between 0 and 3),
  color       text not null default '#FF6A3D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  start_date  date,
  deadline    date,
  budget      numeric(14, 2) not null default 0 check (budget between 0 and 1000000000),
  paid        numeric(14, 2) not null default 0 check (paid between 0 and 1000000000),
  link        text not null default '' check (char_length(link) <= 500),
  -- Этапы: [{ id, t, done, due }]
  tasks       jsonb not null default '[]'::jsonb check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) <= 100),
  position    double precision not null default 0,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ws_projects_user on public.ws_projects(user_id, status, deadline);

alter table public.ws_projects enable row level security;
drop policy if exists "ws_projects: только свои" on public.ws_projects;
create policy "ws_projects: только свои" on public.ws_projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists ws_projects_deny_banned on public.ws_projects;
create trigger ws_projects_deny_banned before insert or update on public.ws_projects for each row execute function public.deny_banned();
