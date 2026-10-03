-- AURA: 12 уровней вместо 6. Старые пороги сохранены, между ними — новые уровни
-- 0 Искра · 50 Огонёк · 100 Пламя · 175 Жар · 250 Сияние · 400 Луч · 600 Звезда · 900 Созвездие · 1200 Сверхновая · 1800 Галактика · 2500 Легенда · 4000 Миф
create or replace function public.aura_tier(p int) returns int
language sql immutable as $$
  select case
    when p >= 4000 then 11 when p >= 2500 then 10 when p >= 1800 then 9 when p >= 1200 then 8
    when p >= 900 then 7 when p >= 600 then 6 when p >= 400 then 5 when p >= 250 then 4
    when p >= 175 then 3 when p >= 100 then 2 when p >= 50 then 1 else 0 end;
$$;

-- Бонус за уровень: на старых порогах прежние суммы, так что ни у кого баланс не уменьшится
create or replace function public.coins_earned(p_peak int) returns int
language sql immutable as $$
  select (array[100, 170, 250, 370, 500, 700, 900, 1250, 1600, 2300, 3000, 5000])[aura_tier(p_peak) + 1] + greatest(p_peak, 0) / 5;
$$;

-- Ограничения магазина переводим на новую шкалу уровней
alter table public.shop_items drop constraint if exists shop_items_min_tier_check;
update public.shop_items set min_tier = case min_tier when 1 then 2 when 2 then 4 when 3 then 6 when 4 then 8 when 5 then 10 else min_tier end
where min_tier between 1 and 5;
alter table public.shop_items add constraint shop_items_min_tier_check check (min_tier between 0 and 11);
