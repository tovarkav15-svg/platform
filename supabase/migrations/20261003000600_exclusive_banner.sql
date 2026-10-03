-- Эксклюзивные предметы: не продаются и не выпадают из сундука, выдаются лично
alter table public.shop_items add column if not exists hidden boolean not null default false;

insert into public.shop_items (id, kind, name, price, min_tier, sort, hidden)
values ('b-alpine', 'banner', 'Альпийский рассвет', 0, 0, 100, true)
on conflict (id) do update set name = excluded.name, hidden = true, price = 0;

-- Выдаём @fedonko и сразу надеваем
insert into public.user_items (user_id, item_id, price)
select id, 'b-alpine', 0 from public.profiles where username = 'fedonko'
on conflict do nothing;
insert into public.profile_deco (user_id, banner)
select id, 'b-alpine' from public.profiles where username = 'fedonko'
on conflict (user_id) do update set banner = 'b-alpine', updated_at = now();

-- Сундук не выдаёт эксклюзивы
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
  where not si.hidden and not exists (select 1 from user_items ui where ui.user_id = v_uid and ui.item_id = si.id)
  order by -ln(greatest(random(), 1e-9)) / (
      case when si.price < 200 then 10 when si.price < 500 then 5 when si.price < 1000 then 2 else 0.5 end
      * case when si.min_tier > aura_tier(v_w.peak) then 0.7 else 1 end)
  limit 1;
  if v_item is null then raise exception 'У тебя уже собрана вся коллекция!'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, v_item, c_price);
  return v_item;
end $$;

-- Купить эксклюзив нельзя
create or replace function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item shop_items; v_w record; v_left int;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_item from shop_items where id = p_item;
  if not found or v_item.hidden then raise exception 'Такого предмета нет'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;
  select coins_earned(w.aura_peak) + ref_total(v_uid) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if exists (select 1 from user_items where user_id = v_uid and item_id = p_item) then raise exception 'Уже куплено'; end if;
  if aura_tier(v_w.peak) < v_item.min_tier then raise exception 'Нужен уровень повыше'; end if;
  if v_left < v_item.price then raise exception 'Не хватает Coins'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, p_item, v_item.price);
  return v_left - v_item.price;
end $$;
