-- Сундук удачи: может выпасть любой предмет, даже выше твоего уровня. Редкие и дорогие — реже (взвешенный случай)
create or replace function public.open_chest() returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w record; v_left int; v_item text; c_price constant int := 150;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;
  select coins_earned(w.aura_peak) + ref_total(v_uid) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if v_left < c_price then raise exception 'Не хватает Coins'; end if;
  -- вес: обычные 10, редкие 5, эпические 2, легендарные 0.5; всё, что выше уровня, — ещё чуть реже
  select si.id into v_item from shop_items si
  where not exists (select 1 from user_items ui where ui.user_id = v_uid and ui.item_id = si.id)
  order by -ln(greatest(random(), 1e-9)) / (
      case when si.price < 200 then 10 when si.price < 500 then 5 when si.price < 1000 then 2 else 0.5 end
      * case when si.min_tier > aura_tier(v_w.peak) then 0.7 else 1 end)
  limit 1;
  if v_item is null then raise exception 'У тебя уже собрана вся коллекция!'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, v_item, c_price);
  return v_item;
end $$;
