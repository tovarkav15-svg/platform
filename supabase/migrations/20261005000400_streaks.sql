-- Серия выполнения планов (как огонёк в Duolingo/TikTok): день засчитан, если закрыта хотя бы одна задача.
-- Журнал ведёт база сама — повторяющиеся задачи не «закрываются», а удалённые пропадают, поэтому считать по plan_tasks нельзя.
-- Сутки — по Москве, большинство людей на площадке там.

create or replace function public.msk_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Moscow')::date $$;

create table if not exists public.plan_streak_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  n       int not null default 1,
  primary key (user_id, day)
);
create table if not exists public.streak_rewards (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  milestone  int not null,
  coins      int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, milestone)
);
alter table public.plan_streak_days enable row level security;
alter table public.streak_rewards enable row level security;
drop policy if exists "streak: свой" on public.plan_streak_days;
create policy "streak: свой" on public.plan_streak_days for select using (user_id = auth.uid());
drop policy if exists "streak rewards: свои" on public.streak_rewards;
create policy "streak rewards: свои" on public.streak_rewards for select using (user_id = auth.uid());

-- Награды за отметки серии (один раз за всё время)
create or replace function public.streak_milestones() returns table (milestone int, coins int)
language sql immutable as $$ values (3, 10), (7, 25), (14, 50), (30, 100), (60, 150), (100, 300), (365, 1000) $$;

-- Текущая и лучшая серия. Если сегодня ещё ничего не закрыто, серия жива до конца дня (считаем от вчера)
create or replace function public.streak_calc(p_user uuid) returns table (cur int, best int, today_done boolean)
language sql security definer set search_path = public stable as $$
  with d as (select day from plan_streak_days where user_id = p_user),
  isl as (
    select min(day) s, max(day) e, count(*)::int n
    from (select day, day - (row_number() over (order by day))::int g from d) x group by g
  ),
  a as (select case when exists (select 1 from d where day = msk_today()) then msk_today()
                    when exists (select 1 from d where day = msk_today() - 1) then msk_today() - 1 end anchor)
  select coalesce((select n from isl, a where isl.e = a.anchor), 0),
         coalesce((select max(n) from isl), 0),
         exists (select 1 from d where day = msk_today());
$$;
revoke execute on function public.streak_calc(uuid) from public;

create or replace function public.streak_award(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c int; got int := 0;
begin
  select cur into c from streak_calc(p_user);
  insert into streak_rewards (user_id, milestone, coins)
  select p_user, m.milestone, m.coins from streak_milestones() m where m.milestone <= c
  on conflict do nothing;
  get diagnostics got = row_count;
  return got;
end $$;
revoke execute on function public.streak_award(uuid) from public;

-- Задача закрыта (или повторяющаяся переехала вперёд) → день засчитан; снята отметка сегодня → минус
create or replace function public.plan_streak_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.done and not old.done)
     or (not new.done and not old.done and new.repeat <> '' and old.due_date is not null and new.due_date > old.due_date) then
    insert into plan_streak_days (user_id, day) values (new.user_id, msk_today())
    on conflict (user_id, day) do update set n = plan_streak_days.n + 1;
    perform public.streak_award(new.user_id);
  elsif old.done and not new.done and old.done_at is not null and (old.done_at at time zone 'Europe/Moscow')::date = msk_today() then
    update plan_streak_days set n = n - 1 where user_id = new.user_id and day = msk_today();
    delete from plan_streak_days where user_id = new.user_id and day = msk_today() and n <= 0;
  end if;
  return new;
end $$;
drop trigger if exists plan_streak_track on public.plan_tasks;
create trigger plan_streak_track after update on public.plan_tasks for each row execute function public.plan_streak_track();

-- Всё для карточки серии одним запросом
create or replace function public.my_streak() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare u uuid := auth.uid(); s record; nxt record;
begin
  if u is null then return null; end if;
  select * into s from streak_calc(u);
  select m.milestone, m.coins into nxt from streak_milestones() m where m.milestone > s.cur order by m.milestone limit 1;
  return jsonb_build_object(
    'current', s.cur, 'best', s.best, 'today_done', s.today_done, 'today', msk_today(),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day) from plan_streak_days where user_id = u and day > msk_today() - 42), '[]'::jsonb),
    'next', case when nxt.milestone is null then null else jsonb_build_object('milestone', nxt.milestone, 'coins', nxt.coins) end,
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('milestone', milestone, 'coins', coins, 'at', created_at) order by milestone) from streak_rewards where user_id = u), '[]'::jsonb)
  );
end $$;
revoke execute on function public.my_streak() from public;
grant execute on function public.my_streak() to authenticated;

-- Серия других людей (для профиля и лидеров) — только число
create or replace function public.streak_of(p_users uuid[]) returns table (user_id uuid, cur int)
language sql security definer set search_path = public stable as $$
  select x, (select cur from streak_calc(x)) from unnest(p_users) x;
$$;
revoke execute on function public.streak_of(uuid[]) from public;
grant execute on function public.streak_of(uuid[]) to anon, authenticated;

-- Coins за серию добавляются к бонусам (тот же счётчик, что и за приглашённых друзей)
create or replace function public.ref_total(p_user uuid) returns int
language sql security definer set search_path = public stable as $$
  select (coalesce((select sum(coins) from referral_rewards where referrer = p_user), 0)
        + coalesce((select sum(coins) from streak_rewards where user_id = p_user), 0))::int;
$$;

-- История: дни, когда задачи уже закрывались
insert into plan_streak_days (user_id, day, n)
select user_id, (done_at at time zone 'Europe/Moscow')::date, count(*)
from plan_tasks where done and done_at is not null group by 1, 2
on conflict (user_id, day) do nothing;
-- Награды за уже набранные серии
select public.streak_award(id) from public.profiles;

do $$ begin alter publication supabase_realtime add table public.plan_streak_days; exception when duplicate_object then null; end $$;
