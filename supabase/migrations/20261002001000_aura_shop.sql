-- AURA проще получить + AURA Shop: Coins за уровни и декор профиля

-- ============ Новые правила AURA ============
--  заполненный профиль +15 за каждое из 6 полей (аватар, баннер, био, ниши, «о себе», «ищу»)
--  Proof of Work +50 (до 30) · проект +60 (до 15) · этап готов +20 (до 100) · цель покорена +60 (до 30)
--  задача выполнена +5 (до 300) · друг +10 (до 150) · подписчик каналов +3 (до 1000) · активный день +10 (60 дней) · статья +100
drop function if exists public.leaderboard(text, int);
drop function if exists public.aura_table();

create function public.aura_table() returns table (
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
  a as (select author_id, count(*)::int n from articles where published group by author_id)
  select p.id,
    (p.filled*15 + least(coalesce(w.n,0),30)*50 + least(coalesce(pr.n,0),15)*60 + least(coalesce(ms.n,0),100)*20 + least(coalesce(g.n,0),30)*60
     + least(coalesce(t.n,0),300)*5 + least(coalesce(f.n,0),150)*10 + least(coalesce(s.n,0),1000)*3 + coalesce(d.n,0)*10 + coalesce(a.n,0)*100)::int,
    coalesce(w.n,0), coalesce(pr.n,0), coalesce(ms.n,0), coalesce(g.n,0), coalesce(t.n,0), coalesce(f.n,0), coalesce(s.n,0), coalesce(d.n,0), coalesce(a.n,0), p.filled
  from p
  left join w on w.user_id = p.id left join pr on pr.user_id = p.id left join ms on ms.user_id = p.id left join g on g.user_id = p.id
  left join t on t.user_id = p.id left join f on f.u = p.id left join s on s.u = p.id left join d on d.user_id = p.id left join a on a.author_id = p.id;
$$;

create function public.leaderboard(p_niche text default null, p_limit int default 100) returns table (
  rank int, user_id uuid, username text, display_name text, avatar text, accent text, niches text, role text, is_support boolean,
  aura int, works int, projects int, milestones int, goals int, tasks int, friends int, subs int, days int, articles int, profile int
)
language sql security definer set search_path = public stable as $$
  select (row_number() over (order by a.aura desc, pr.created_at))::int, pr.id, pr.username, pr.display_name, pr.avatar, pr.accent, pr.niches, pr.role, pr.is_support,
         a.aura, a.works, a.projects, a.milestones, a.goals, a.tasks, a.friends, a.subs, a.days, a.articles, a.profile
  from aura_table() a join profiles pr on pr.id = a.user_id
  where p_niche is null or pr.niches like '%' || p_niche || '%'
  order by a.aura desc, pr.created_at
  limit least(coalesce(p_limit, 100), 500);
$$;

-- Уровни: 0 Искра · 100 Пламя · 250 Сияние · 600 Звезда · 1200 Сверхновая · 2500 Легенда
create or replace function public.aura_tier(p int) returns int
language sql immutable as $$
  select case when p >= 2500 then 5 when p >= 1200 then 4 when p >= 600 then 3 when p >= 250 then 2 when p >= 100 then 1 else 0 end;
$$;

-- Coins: бонус за каждый достигнутый уровень + 1 монета за каждые 5 AURA (по пику, чтобы монеты не сгорали)
create or replace function public.coins_earned(p_peak int) returns int
language sql immutable as $$
  select (array[100, 250, 500, 900, 1600, 3000])[aura_tier(p_peak) + 1] + greatest(p_peak, 0) / 5;
$$;

-- ============ Магазин ============
create table if not exists public.shop_items (
  id       text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  kind     text not null check (kind in ('banner', 'ring', 'name', 'title')),
  name     text not null,
  price    int not null check (price >= 0),
  min_tier int not null default 0 check (min_tier between 0 and 5),
  sort     int not null default 0
);

create table if not exists public.wallets (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  aura_peak  int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_items (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  item_id   text not null references public.shop_items(id),
  price     int not null,
  bought_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Что сейчас надето. Пишется только через equip_item, читают все
create table if not exists public.profile_deco (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  banner     text references public.shop_items(id),
  ring       text references public.shop_items(id),
  name_fx    text references public.shop_items(id),
  title      text references public.shop_items(id),
  updated_at timestamptz not null default now()
);

alter table public.shop_items enable row level security;
alter table public.wallets enable row level security;
alter table public.user_items enable row level security;
alter table public.profile_deco enable row level security;

drop policy if exists "shop: все видят витрину" on public.shop_items;
create policy "shop: все видят витрину" on public.shop_items for select using (true);
drop policy if exists "wallet: вижу свой" on public.wallets;
create policy "wallet: вижу свой" on public.wallets for select using (user_id = auth.uid());
drop policy if exists "items: вижу свои" on public.user_items;
create policy "items: вижу свои" on public.user_items for select using (user_id = auth.uid());
drop policy if exists "deco: все видят" on public.profile_deco;
create policy "deco: все видят" on public.profile_deco for select using (true);

insert into public.shop_items (id, kind, name, price, min_tier, sort) values
  ('b-sunset',  'banner', 'Тёплый закат',     120, 0, 1),
  ('b-aurora',  'banner', 'Северное сияние',  200, 0, 2),
  ('b-waves',   'banner', 'Волны',            250, 1, 3),
  ('b-stars',   'banner', 'Звёздная пыль',    350, 1, 4),
  ('b-grid',    'banner', 'Неоновая сетка',   450, 2, 5),
  ('b-holo',    'banner', 'Голограмма',       600, 2, 6),
  ('b-petals',  'banner', 'Лепестки',         800, 3, 7),
  ('b-gold',    'banner', 'Золотая пыль',    1600, 4, 8),
  ('r-pulse',   'ring',   'Пульс',            100, 0, 1),
  ('r-rainbow', 'ring',   'Радужное кольцо',  220, 0, 2),
  ('r-orbit',   'ring',   'Орбита',           300, 1, 3),
  ('r-flame',   'ring',   'Пламя',            450, 1, 4),
  ('r-sparks',  'ring',   'Искры',            600, 2, 5),
  ('r-saturn',  'ring',   'Кольца Сатурна',   900, 3, 6),
  ('r-crown',   'ring',   'Корона легенды',  2000, 5, 7),
  ('n-shine',   'name',   'Блик',             150, 0, 1),
  ('n-ink',     'name',   'Чернильный перелив',300, 1, 2),
  ('n-glow',    'name',   'Мягкое сияние',    450, 2, 3),
  ('n-gold',    'name',   'Золото',          1200, 4, 4),
  ('t-first',   'title',  'Первопроходец',     80, 0, 1),
  ('t-flow',    'title',  'В потоке',         100, 0, 2),
  ('t-owl',     'title',  'Ночная сова',      120, 0, 3),
  ('t-deadline','title',  'Мастер дедлайнов', 250, 1, 4),
  ('t-vision',  'title',  'Визионер',         400, 2, 5),
  ('t-mentor',  'title',  'Наставник',        600, 3, 6),
  ('t-legend',  'title',  'Легенда платформы',1800, 5, 7)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort;

-- Кошелёк: обновляет пик AURA и считает баланс
create or replace function public.my_wallet() returns table (aura int, peak int, tier int, earned int, spent int, balance int)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_aura int; v_peak int; v_spent int;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select a.aura into v_aura from aura_table() a where a.user_id = v_uid;
  v_aura := coalesce(v_aura, 0);
  insert into wallets (user_id, aura_peak) values (v_uid, v_aura)
    on conflict (user_id) do update set aura_peak = greatest(wallets.aura_peak, excluded.aura_peak), updated_at = now()
    returning aura_peak into v_peak;
  select coalesce(sum(ui.price), 0)::int into v_spent from user_items ui where ui.user_id = v_uid;
  return query select v_aura, v_peak, aura_tier(v_peak), coins_earned(v_peak), v_spent, coins_earned(v_peak) - v_spent;
end $$;

create or replace function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item shop_items; v_w record; v_left int;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_item from shop_items where id = p_item;
  if not found then raise exception 'Такого предмета нет'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;  -- одна покупка за раз
  select coins_earned(w.aura_peak) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if exists (select 1 from user_items where user_id = v_uid and item_id = p_item) then raise exception 'Уже куплено'; end if;
  if aura_tier(v_w.peak) < v_item.min_tier then raise exception 'Нужен уровень повыше'; end if;
  if v_left < v_item.price then raise exception 'Не хватает Coins'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, p_item, v_item.price);
  return v_left - v_item.price;
end $$;

-- Надеть или снять (p_item = null) предмет в слот своего вида
create or replace function public.equip_item(p_kind text, p_item text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  if p_kind not in ('banner', 'ring', 'name', 'title') then raise exception 'Неизвестный слот'; end if;
  if p_item is not null and not exists (
    select 1 from user_items ui join shop_items si on si.id = ui.item_id where ui.user_id = v_uid and ui.item_id = p_item and si.kind = p_kind
  ) then raise exception 'Этого предмета нет в коллекции'; end if;
  insert into profile_deco (user_id) values (v_uid) on conflict (user_id) do nothing;
  update profile_deco set
    banner  = case when p_kind = 'banner' then p_item else banner end,
    ring    = case when p_kind = 'ring'   then p_item else ring end,
    name_fx = case when p_kind = 'name'   then p_item else name_fx end,
    title   = case when p_kind = 'title'  then p_item else title end,
    updated_at = now()
  where user_id = v_uid;
end $$;

revoke execute on function public.aura_table(), public.leaderboard(text, int), public.my_wallet(), public.buy_item(text), public.equip_item(text, text) from public;
revoke execute on function public.aura_table() from anon, authenticated;
grant execute on function public.leaderboard(text, int) to anon, authenticated;
grant execute on function public.my_wallet(), public.buy_item(text), public.equip_item(text, text) to authenticated;
grant execute on function public.aura_tier(int), public.coins_earned(int) to anon, authenticated;
