-- Привычки в Workspace: сама привычка и отметки «сделал в этот день». Видит только владелец.

create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 60),
  emoji      text not null default '✨' check (char_length(emoji) <= 8),
  color      text not null default '#7B61FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  per_week   smallint not null default 7 check (per_week between 1 and 7), -- сколько раз в неделю
  archived   boolean not null default false,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists habits_user on public.habits(user_id, archived, sort);

create table if not exists public.habit_checks (
  habit_id   uuid not null references public.habits(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists habit_checks_user on public.habit_checks(user_id, day desc);

alter table public.habits enable row level security;
alter table public.habit_checks enable row level security;
drop policy if exists "только владелец" on public.habits;
create policy "только владелец" on public.habits for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "только владелец" on public.habit_checks;
create policy "только владелец" on public.habit_checks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Отметку можно поставить только своей привычке и не в будущем
create or replace function public.habit_check_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from habits where id = new.habit_id and user_id = new.user_id) then raise exception 'not your habit'; end if;
  if new.day > current_date + 1 then raise exception 'future day'; end if;
  return new;
end $$;
revoke all on function public.habit_check_guard() from public, anon, authenticated;
drop trigger if exists habit_checks_guard on public.habit_checks;
create trigger habit_checks_guard before insert on public.habit_checks for each row execute function public.habit_check_guard();
