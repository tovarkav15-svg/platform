-- Заметки в Workspace: проекты, идеи и всё остальное. Видит только автор
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  folder     text not null default 'Заметки' check (char_length(folder) between 1 and 40),
  title      text not null default '' check (char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 50000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user on public.notes(user_id, pinned desc, updated_at desc);
alter table public.notes enable row level security;
drop policy if exists "notes: только свои" on public.notes;
create policy "notes: только свои" on public.notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists notes_deny_banned on public.notes;
create trigger notes_deny_banned before insert or update on public.notes for each row execute function public.deny_banned();
