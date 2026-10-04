-- Аналитика для модераторов: ключевые цифры, ряды по дням, воронка, источники, ниши
create or replace function public.admin_stats(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 7), 180);
  since date := current_date - (d - 1);
  r jsonb;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;

  with days as (select generate_series(since, current_date, interval '1 day')::date as day),
  series as (
    select jsonb_agg(jsonb_build_object(
      'day', dd.day,
      'signups', (select count(*) from profiles p where p.created_at::date = dd.day),
      'active', (select count(*) from activity_days a where a.day = dd.day),
      'messages', (select count(*) from messages m where m.created_at::date = dd.day and m.kind <> 'system'),
      'orders', (select count(*) from orders o where o.created_at::date = dd.day),
      'responses', (select count(*) from order_responses x where x.created_at::date = dd.day),
      'jobs', (select count(*) from jobs j where j.created_at::date = dd.day)
    ) order by dd.day) s
    from days dd
  ),
  base as (
    select p.id, p.created_at, p.referred_by,
      ((p.avatar is not null)::int + (p.banner_path is not null)::int + (p.bio <> '')::int + (p.niches <> '')::int + (p.about <> '')::int + (p.looking_for <> '')::int) as filled,
      exists (select 1 from works w where w.user_id = p.id) or exists (select 1 from projects pr where pr.user_id = p.id) or exists (select 1 from jobs j where j.user_id = p.id) as showed,
      exists (select 1 from activity_days a where a.user_id = p.id and a.day > current_date - 7) as active7
    from profiles p
  )
  select jsonb_build_object(
    'days', d,
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles),
      'new', (select count(*) from profiles where created_at::date >= since),
      'active_today', (select count(*) from activity_days where day = current_date),
      'active7', (select count(distinct user_id) from activity_days where day > current_date - 7),
      'active30', (select count(distinct user_id) from activity_days where day > current_date - 30),
      'online_now', (select count(*) from presence where last_seen > now() - interval '3 minutes'),
      'messages', (select count(*) from messages where created_at::date >= since and kind <> 'system'),
      'jobs', (select count(*) from jobs where active and mod_status <> 'rejected'),
      'orders_open', (select count(*) from orders where status = 'open' and mod_status <> 'rejected'),
      'orders_in_work', (select count(*) from orders where status = 'in_work'),
      'responses', (select count(*) from order_responses where created_at::date >= since),
      'works', (select count(*) from works),
      'projects', (select count(*) from projects),
      'articles', (select count(*) from articles where published),
      'banned', (select count(*) from profiles where banned_until > now()),
      'reports_open', (select count(*) from reports where status = 'open'),
      'coins_spent', (select coalesce(sum(price), 0) from user_items)
    ),
    -- через неделю после регистрации: из тех, кто зарегистрировался 7–30 дней назад, сколько заходили за последние 7 дней
    'retention', (
      select jsonb_build_object('cohort', count(*), 'returned', count(*) filter (where active7))
      from base where created_at::date between current_date - 30 and current_date - 7
    ),
    'funnel', (
      select jsonb_build_object(
        'registered', count(*),
        'profile', count(*) filter (where filled >= 3),
        'showed', count(*) filter (where showed),
        'active7', count(*) filter (where active7)
      ) from base
    ),
    'sources', (
      select jsonb_build_object('referral', count(*) filter (where referred_by is not null), 'organic', count(*) filter (where referred_by is null))
      from profiles where created_at::date >= since
    ),
    'referrers', coalesce((
      select jsonb_agg(t order by t->>'n' desc) from (
        select jsonb_build_object('username', r.username, 'name', r.display_name, 'n', count(p.id), 'confirmed', count(rr.referee)) t
        from profiles p join profiles r on r.id = p.referred_by
        left join referral_rewards rr on rr.referee = p.id
        group by r.id, r.username, r.display_name
        order by count(p.id) desc limit 8
      ) x
    ), '[]'::jsonb),
    'niches', coalesce((
      select jsonb_object_agg(n, c) from (
        select trim(n) n, count(*) c from profiles, unnest(string_to_array(niches, ',')) n where trim(n) <> '' group by trim(n)
      ) z
    ), '{}'::jsonb),
    'series', (select s from series)
  ) into r;
  return r;
end $$;

revoke execute on function public.admin_stats(int) from public;
grant execute on function public.admin_stats(int) to authenticated;
