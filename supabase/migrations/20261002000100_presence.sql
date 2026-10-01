-- Статус как в Discord: в сети / на платформе (отошёл) / спит
create table if not exists public.presence (
  user_id   uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  state     text not null default 'online' check (state in ('online', 'idle')),
  last_seen timestamptz not null default now()
);
alter table public.presence enable row level security;
drop policy if exists "presence: все видят" on public.presence;
create policy "presence: все видят" on public.presence for select using (true);
drop policy if exists "presence: свой" on public.presence;
create policy "presence: свой" on public.presence for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Отметки о прочтении приходят мгновенно
do $$ begin
  alter publication supabase_realtime add table public.chat_members;
exception when duplicate_object then null; end $$;
