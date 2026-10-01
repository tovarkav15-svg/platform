-- Биржа вакансий: карточки специалистов с услугой, средним чеком и кейсами
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  service     text not null check (char_length(trim(service)) between 2 and 80),
  niche       text not null default '',
  description text not null default '' check (char_length(description) <= 600),
  avg_check   integer not null default 0 check (avg_check between 0 and 100000000),
  photo_path  text check (photo_path is null or split_part(photo_path, '/', 1) = user_id::text),
  cases       jsonb not null default '[]'::jsonb check (jsonb_typeof(cases) = 'array' and jsonb_array_length(cases) <= 6),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists jobs_time on public.jobs(active, updated_at desc);

alter table public.jobs enable row level security;
drop policy if exists "jobs: все читают активные" on public.jobs;
create policy "jobs: все читают активные" on public.jobs for select using (active or user_id = auth.uid());
drop policy if exists "jobs: свои" on public.jobs;
create policy "jobs: свои" on public.jobs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
