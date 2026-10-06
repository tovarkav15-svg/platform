-- Ручные начисления AURA (бонусы от команды). Учитываются в AURA, лидерборде, уровнях и Coins

create table if not exists public.aura_bonus (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     int not null check (amount between -100000 and 100000),
  reason     text not null default '' check (char_length(reason) <= 200),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists aura_bonus_user on public.aura_bonus(user_id);
alter table public.aura_bonus enable row level security;
drop policy if exists "aura bonus: свои и модераторы" on public.aura_bonus;
create policy "aura bonus: свои и модераторы" on public.aura_bonus for select using (user_id = auth.uid() or public.is_moderator());

create or replace function public.aura_table() returns table (
  user_id uuid, aura int, works int, projects int, milestones int, goals int, tasks int, friends int, subs int, days int, articles int, profile int
)
language sql security definer set search_path = public stable as $$
  with p as (
    select id, ((avatar is not null)::int + (banner_path is not null)::int + (bio <> '')::int + (niches <> '')::int + (about <> '')::int + (looking_for <> '')::int) as filled
    from profiles
  ),
  w as (select user_id, count(*)::int n from works group by user_id),
  pr as (select user_id, count(*)::int n from projects group by user_id),
  ms as (select p.user_id, count(*)::int n from project_milestones m join projects p on p.id = m.project_id where m.status = 'done' group by p.user_id),
  g as (select user_id, count(*)::int n from goals where done group by user_id),
  t as (select user_id, sum(n)::int n from (select user_id, count(*) n from tasks where done group by user_id union all select user_id, count(*) n from plan_tasks where done group by user_id) x group by user_id),
  f as (select u, count(*)::int n from (select requester u from friendships where status = 'accepted' union all select addressee from friendships where status = 'accepted') x group by u),
  s as (select c.owner_id u, count(*)::int n from chats c join chat_members m on m.chat_id = c.id and m.user_id <> c.owner_id where c.kind = 'channel' group by c.owner_id),
  d as (select user_id, count(*)::int n from activity_days where day > current_date - 60 group by user_id),
  a as (select author_id, count(*)::int n from articles where published group by author_id),
  bn as (select user_id, sum(amount)::int n from aura_bonus group by user_id)
  select p.id,
    (p.filled*15 + least(coalesce(w.n,0),30)*50 + least(coalesce(pr.n,0),15)*60 + least(coalesce(ms.n,0),100)*20 + least(coalesce(g.n,0),30)*60
     + least(coalesce(t.n,0),300)*5 + least(coalesce(f.n,0),150)*10 + least(coalesce(s.n,0),1000)*3 + coalesce(d.n,0)*10 + coalesce(a.n,0)*100 + coalesce(bn.n,0))::int,
    coalesce(w.n,0), coalesce(pr.n,0), coalesce(ms.n,0), coalesce(g.n,0), coalesce(t.n,0), coalesce(f.n,0), coalesce(s.n,0), coalesce(d.n,0), coalesce(a.n,0), p.filled
  from p
  left join w on w.user_id = p.id left join pr on pr.user_id = p.id left join ms on ms.user_id = p.id left join g on g.user_id = p.id
  left join t on t.user_id = p.id left join f on f.u = p.id left join s on s.u = p.id left join d on d.user_id = p.id left join a on a.author_id = p.id
  left join bn on bn.user_id = p.id;
$$;
revoke execute on function public.aura_table() from public, anon, authenticated;

-- Модератор начисляет (или списывает) AURA по юзернейму; всё пишется в журнал модерации
create or replace function public.grant_aura(p_username text, p_amount int, p_reason text default '') returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_total int;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  select id into v_user from profiles where username = lower(trim(leading '@' from trim(p_username)));
  if v_user is null then raise exception 'Пользователь не найден'; end if;
  insert into aura_bonus (user_id, amount, reason, granted_by) values (v_user, p_amount, left(coalesce(p_reason, ''), 200), auth.uid());
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'grant_aura', v_user, p_amount::text || ' ' || coalesce(p_reason, ''));
  select aura into v_total from aura_table() where user_id = v_user;
  return v_total;
end $$;
revoke execute on function public.grant_aura(text, int, text) from public;
grant execute on function public.grant_aura(text, int, text) to authenticated;

-- По просьбе владельца: +3700 AURA для @fedonko
insert into public.aura_bonus (user_id, amount, reason)
select id, 3700, 'Начислено командой Relic' from public.profiles where username = 'fedonko';
