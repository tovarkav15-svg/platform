-- Серия v2: два «выходных» в неделю (❄️) не обрывают серию, задачи-однодневки не засчитываются, рекорд хранится

create table if not exists public.streak_best (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  best    int not null default 0
);
alter table public.streak_best enable row level security;
drop policy if exists "streak best: свой" on public.streak_best;
create policy "streak best: свой" on public.streak_best for select using (user_id = auth.uid());

-- Идём от сегодня назад: выполненный день +1, пропуск — заморозка, пока в этой неделе (пн–вс) их меньше двух.
-- Сегодня, пока не закрыто, не считается пропуском. Заморозки не продлевают серию, только сохраняют её
create or replace function public.streak_walk(p_user uuid) returns table (cur int, today_done boolean, frozen date[])
language plpgsql security definer set search_path = public stable as $$
declare
  t date := msk_today(); d date; first date; c int := 0; fz date[] := '{}'; wk date; used int;
  done_today boolean;
begin
  select min(day) into first from plan_streak_days where user_id = p_user;
  done_today := exists (select 1 from plan_streak_days where user_id = p_user and day = t);
  if first is null then return query select 0, false, '{}'::date[]; return; end if;
  d := case when done_today then t else t - 1 end;
  while d >= first and d > t - 800 loop
    if exists (select 1 from plan_streak_days where user_id = p_user and day = d) then
      c := c + 1;
    else
      wk := d - ((extract(isodow from d))::int - 1);
      select count(*) into used from unnest(fz) f where f between wk and wk + 6;
      exit when used >= 2;
      fz := fz || d;
    end if;
    d := d - 1;
  end loop;
  -- заморозки до первого выполненного дня серии не нужны
  fz := array(select f from unnest(fz) f where f > coalesce((select min(x) from (select day x from plan_streak_days where user_id = p_user and day > d) s), t));
  return query select c, done_today, fz;
end $$;
revoke execute on function public.streak_walk(uuid) from public;

create or replace function public.streak_calc(p_user uuid) returns table (cur int, best int, today_done boolean)
language sql security definer set search_path = public stable as $$
  select w.cur, greatest(w.cur, coalesce((select b.best from streak_best b where b.user_id = p_user), 0)), w.today_done
  from streak_walk(p_user) w;
$$;
revoke execute on function public.streak_calc(uuid) from public;

create or replace function public.streak_award(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c int; got int := 0;
begin
  select cur into c from streak_walk(p_user);
  insert into streak_best (user_id, best) values (p_user, c)
  on conflict (user_id) do update set best = greatest(streak_best.best, excluded.best);
  insert into streak_rewards (user_id, milestone, coins)
  select p_user, m.milestone, m.coins from streak_milestones() m where m.milestone <= c
  on conflict do nothing;
  get diagnostics got = row_count;
  return got;
end $$;
revoke execute on function public.streak_award(uuid) from public;

-- Задача, созданная меньше 3 минут назад, не продлевает серию — чтобы «попить воды» не считалось
create or replace function public.plan_streak_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare fresh boolean := new.created_at > now() - interval '3 minutes';
begin
  if not fresh and ((new.done and not old.done)
     or (not new.done and not old.done and new.repeat <> '' and old.due_date is not null and new.due_date > old.due_date)) then
    insert into plan_streak_days (user_id, day) values (new.user_id, msk_today())
    on conflict (user_id, day) do update set n = plan_streak_days.n + 1;
    perform public.streak_award(new.user_id);
  elsif old.done and not new.done and old.done_at is not null and (old.done_at at time zone 'Europe/Moscow')::date = msk_today()
        and old.created_at <= old.done_at - interval '3 minutes' then
    update plan_streak_days set n = n - 1 where user_id = new.user_id and day = msk_today();
    delete from plan_streak_days where user_id = new.user_id and day = msk_today() and n <= 0;
  end if;
  return new;
end $$;

create or replace function public.my_streak() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare u uuid := auth.uid(); w record; best int; nxt record;
begin
  if u is null then return null; end if;
  select * into w from streak_walk(u);
  best := greatest(w.cur, coalesce((select b.best from streak_best b where b.user_id = u), 0));
  select m.milestone, m.coins into nxt from streak_milestones() m where m.milestone > w.cur order by m.milestone limit 1;
  return jsonb_build_object(
    'current', w.cur, 'best', best, 'today_done', w.today_done, 'today', msk_today(),
    'frozen', to_jsonb(w.frozen),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day) from plan_streak_days where user_id = u and day > msk_today() - 42), '[]'::jsonb),
    'next', case when nxt.milestone is null then null else jsonb_build_object('milestone', nxt.milestone, 'coins', nxt.coins) end,
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('milestone', milestone, 'coins', coins, 'at', created_at) order by milestone) from streak_rewards where user_id = u), '[]'::jsonb)
  );
end $$;

create or replace function public.streak_of(p_users uuid[]) returns table (user_id uuid, cur int)
language sql security definer set search_path = public stable as $$
  select x, (select w.cur from streak_walk(x) w) from unnest(p_users) x;
$$;

-- Для Аналитики модерации: сколько людей держат серию
create or replace function public.admin_streak_stats() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare r jsonb;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  with s as (select p.id, w.cur, w.today_done from profiles p cross join lateral streak_walk(p.id) w)
  select jsonb_build_object(
    'any', count(*) filter (where cur >= 1),
    's3', count(*) filter (where cur >= 3),
    's7', count(*) filter (where cur >= 7),
    'today', count(*) filter (where today_done),
    'max', coalesce(max(cur), 0),
    'coins', coalesce((select sum(coins) from streak_rewards), 0)
  ) into r from s;
  return r;
end $$;
revoke execute on function public.admin_streak_stats() from public;
grant execute on function public.admin_streak_stats() to authenticated;

-- Рекорды по уже накопленной истории
insert into streak_best (user_id, best)
select p.id, greatest((select cur from streak_walk(p.id)), coalesce((
  select max(n) from (select count(*)::int n from (select day, day - (row_number() over (order by day))::int g from plan_streak_days where user_id = p.id) x group by g) y
), 0)) from profiles p
on conflict (user_id) do update set best = greatest(streak_best.best, excluded.best);
