-- Реферальная система: ссылка-приглашение, награда в Coins растёт с числом приведённых друзей.
-- Друг засчитывается, когда наберёт 50 AURA (живой человек, а не пустой аккаунт). Награда начисляется один раз и не сгорает

alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Кто тебя пригласил, задаётся только при регистрации
create or replace function public.protect_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' and coalesce(current_setting('app.moderating', true), '') <> 'on' then
    new.role := old.role;
    new.is_support := old.is_support;
    new.banned_until := old.banned_until;
    new.ban_reason := old.ban_reason;
    new.referred_by := old.referred_by;
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref uuid;
begin
  select id into v_ref from public.profiles where username = lower(nullif(new.raw_user_meta_data->>'ref', ''));
  insert into public.profiles (id, username, display_name, niches, referred_by)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username'),
    coalesce(new.raw_user_meta_data->>'niches', ''),
    case when v_ref is distinct from new.id then v_ref end
  );
  insert into public.private_info (id, email) values (new.id, coalesce(new.raw_user_meta_data->>'contact_email', ''));
  insert into public.earnings (user_id) values (new.id);
  return new;
end $$;

-- Награды: одна строка на приглашённого, записывается навсегда
create table if not exists public.referral_rewards (
  referee    uuid primary key references public.profiles(id) on delete cascade,
  referrer   uuid not null references public.profiles(id) on delete cascade,
  n          int not null,
  coins      int not null,
  created_at timestamptz not null default now()
);
create index if not exists referral_rewards_referrer on public.referral_rewards(referrer);
alter table public.referral_rewards enable row level security;
drop policy if exists "referrals: вижу свои" on public.referral_rewards;
create policy "referrals: вижу свои" on public.referral_rewards for select using (referrer = auth.uid());

-- Сколько Coins за n-го приведённого друга
create or replace function public.ref_coins(n int) returns int
language sql immutable as $$
  select case when n <= 5 then 25 when n <= 10 then 50 when n <= 25 then 75 else 100 end;
$$;

-- Засчитать друзей, которые уже стали активными (50+ AURA)
create or replace function public.process_referrals(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_n int;
begin
  perform 1 from wallets where user_id = p_user for update;
  select count(*) into v_n from referral_rewards where referrer = p_user;
  for r in
    select p.id from profiles p join aura_table() a on a.user_id = p.id
    where p.referred_by = p_user and a.aura >= 50 and (p.banned_until is null or p.banned_until < now())
      and not exists (select 1 from referral_rewards x where x.referee = p.id)
    order by p.created_at
  loop
    v_n := v_n + 1;
    insert into referral_rewards (referee, referrer, n, coins) values (r.id, p_user, v_n, ref_coins(v_n));
  end loop;
end $$;

create or replace function public.ref_total(p_user uuid) returns int
language sql security definer set search_path = public stable as $$
  select coalesce(sum(coins), 0)::int from referral_rewards where referrer = p_user;
$$;

-- Кошелёк: Coins за уровни + за друзей − потраченное
create or replace function public.my_wallet() returns table (aura int, peak int, tier int, earned int, spent int, balance int)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_aura int; v_peak int; v_spent int; v_ref int;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select a.aura into v_aura from aura_table() a where a.user_id = v_uid;
  v_aura := coalesce(v_aura, 0);
  insert into wallets (user_id, aura_peak) values (v_uid, v_aura)
    on conflict (user_id) do update set aura_peak = greatest(wallets.aura_peak, excluded.aura_peak), updated_at = now()
    returning aura_peak into v_peak;
  perform process_referrals(v_uid);
  v_ref := ref_total(v_uid);
  select coalesce(sum(ui.price), 0)::int into v_spent from user_items ui where ui.user_id = v_uid;
  return query select v_aura, v_peak, aura_tier(v_peak), coins_earned(v_peak) + v_ref, v_spent, coins_earned(v_peak) + v_ref - v_spent;
end $$;

create or replace function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item shop_items; v_w record; v_left int;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_item from shop_items where id = p_item;
  if not found then raise exception 'Такого предмета нет'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;
  select coins_earned(w.aura_peak) + ref_total(v_uid) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if exists (select 1 from user_items where user_id = v_uid and item_id = p_item) then raise exception 'Уже куплено'; end if;
  if aura_tier(v_w.peak) < v_item.min_tier then raise exception 'Нужен уровень повыше'; end if;
  if v_left < v_item.price then raise exception 'Не хватает Coins'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, p_item, v_item.price);
  return v_left - v_item.price;
end $$;

create or replace function public.open_chest() returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w record; v_left int; v_item text; c_price constant int := 150;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;
  select coins_earned(w.aura_peak) + ref_total(v_uid) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if v_left < c_price then raise exception 'Не хватает Coins'; end if;
  select si.id into v_item from shop_items si
  where si.price between 100 and 500 and si.min_tier <= aura_tier(v_w.peak)
    and not exists (select 1 from user_items ui where ui.user_id = v_uid and ui.item_id = si.id)
  order by random() limit 1;
  if v_item is null then raise exception 'В сундуке закончились предметы для тебя'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, v_item, c_price);
  return v_item;
end $$;

-- Мои приглашённые: кто засчитан, кто ещё набирает AURA
create or replace function public.my_referrals() returns table (username text, display_name text, avatar text, accent text, aura int, coins int, n int, joined timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  perform process_referrals(auth.uid());
  return query
    select p.username, p.display_name, p.avatar, p.accent, coalesce(a.aura, 0), rr.coins, rr.n, p.created_at
    from profiles p left join aura_table() a on a.user_id = p.id left join referral_rewards rr on rr.referee = p.id
    where p.referred_by = auth.uid()
    order by p.created_at desc;
end $$;

revoke execute on function public.process_referrals(uuid), public.ref_total(uuid), public.my_referrals() from public;
grant execute on function public.my_referrals() to authenticated;
grant execute on function public.ref_coins(int) to anon, authenticated;
