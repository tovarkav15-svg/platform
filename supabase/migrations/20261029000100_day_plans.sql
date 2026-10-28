-- Планирование дня в Workspace: расписание блоками, главные 3 дела и итоги дня. Видит только автор
create table if not exists public.day_plans (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  -- [{ id, title, start (минуты от полуночи), dur, cat, done, task_id?, project_id?, stage_id? }]
  blocks     jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 80),
  big3       jsonb not null default '[]'::jsonb check (jsonb_typeof(big3) = 'array' and jsonb_array_length(big3) <= 3),
  mood       smallint check (mood between 1 and 5),
  note       text not null default '' check (char_length(note) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_plans enable row level security;
drop policy if exists "day_plans: только свои" on public.day_plans;
create policy "day_plans: только свои" on public.day_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists day_plans_deny_banned on public.day_plans;
create trigger day_plans_deny_banned before insert or update on public.day_plans for each row execute function public.deny_banned();
