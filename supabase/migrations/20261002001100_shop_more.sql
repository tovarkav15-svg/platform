-- AURA Shop: фоны профиля, новые предметы, «Сундук удачи»

alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('banner', 'ring', 'name', 'title', 'bg'));
alter table public.profile_deco add column if not exists page_bg text references public.shop_items(id);

insert into public.shop_items (id, kind, name, price, min_tier, sort) values
  ('b-rain',      'banner', 'Тихий дождь',        180, 0, 10),
  ('b-bubbles',   'banner', 'Пузыри',             220, 0, 11),
  ('b-snow',      'banner', 'Снегопад',           260, 1, 12),
  ('b-confetti',  'banner', 'Конфетти',           320, 1, 13),
  ('b-film',      'banner', 'Киноплёнка',         380, 1, 14),
  ('b-matrix',    'banner', 'Поток кода',         420, 2, 15),
  ('b-fireflies', 'banner', 'Светлячки',          520, 2, 16),
  ('b-mesh',      'banner', 'Жидкий градиент',    700, 3, 17),
  ('r-dash',      'ring',   'Пунктир',            120, 0, 10),
  ('r-double',    'ring',   'Двойной неон',       260, 1, 11),
  ('r-hearts',    'ring',   'Сердечки',           340, 1, 12),
  ('r-ice',       'ring',   'Лёд',                420, 2, 13),
  ('r-glitch',    'ring',   'Глитч',              650, 2, 14),
  ('r-galaxy',    'ring',   'Галактика',          750, 3, 15),
  ('r-eclipse',   'ring',   'Затмение',          1100, 4, 16),
  ('n-rainbow',   'name',   'Радуга',             350, 1, 10),
  ('n-neon',      'name',   'Неон',               500, 2, 11),
  ('n-fire',      'name',   'Огонь',              600, 2, 12),
  ('n-ice',       'name',   'Иней',               600, 2, 13),
  ('n-glitch',    'name',   'Глитч',              900, 3, 14),
  ('t-early',     'title',  'Ранняя пташка',      120, 0, 10),
  ('t-editor',    'title',  'Монтажёр от бога',   150, 0, 11),
  ('t-coder',     'title',  'Вайбкодер',          150, 0, 12),
  ('t-eye',       'title',  'Глаз-алмаз',         150, 0, 13),
  ('t-calm',      'title',  'Дзен',               180, 0, 14),
  ('t-hits',      'title',  'Делает хиты',        200, 0, 15),
  ('t-hustle',    'title',  'Без выходных',       200, 0, 16),
  ('t-soul',      'title',  'Душа компании',      250, 1, 17),
  ('t-marathon',  'title',  'Марафонец',          300, 1, 18),
  ('t-boss',      'title',  'Босс',              1200, 4, 19),
  ('p-dots',      'bg',     'Плывущие точки',     150, 0, 1),
  ('p-pastel',    'bg',     'Пастельное сияние',  250, 0, 2),
  ('p-grid',      'bg',     'Чертёж',             300, 1, 3),
  ('p-waves',     'bg',     'Волны',              400, 1, 4),
  ('p-stars',     'bg',     'Звёздное небо',      600, 2, 5),
  ('p-sunrise',   'bg',     'Рассвет',            800, 3, 6),
  ('p-cosmos',    'bg',     'Космос',            1500, 4, 7)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort;

create or replace function public.equip_item(p_kind text, p_item text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  if p_kind not in ('banner', 'ring', 'name', 'title', 'bg') then raise exception 'Неизвестный слот'; end if;
  if p_item is not null and not exists (
    select 1 from user_items ui join shop_items si on si.id = ui.item_id where ui.user_id = v_uid and ui.item_id = p_item and si.kind = p_kind
  ) then raise exception 'Этого предмета нет в коллекции'; end if;
  insert into profile_deco (user_id) values (v_uid) on conflict (user_id) do nothing;
  update profile_deco set
    banner  = case when p_kind = 'banner' then p_item else banner end,
    ring    = case when p_kind = 'ring'   then p_item else ring end,
    name_fx = case when p_kind = 'name'   then p_item else name_fx end,
    title   = case when p_kind = 'title'  then p_item else title end,
    page_bg = case when p_kind = 'bg'     then p_item else page_bg end,
    updated_at = now()
  where user_id = v_uid;
end $$;

-- Сундук удачи: 150 Coins → случайный предмет, которого ещё нет (до 500 Coins, по твоему уровню). Записывается по цене сундука
create or replace function public.open_chest() returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_w record; v_left int; v_item text; c_price constant int := 150;
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  select * into v_w from my_wallet();
  perform 1 from wallets where user_id = v_uid for update;
  select coins_earned(w.aura_peak) - coalesce((select sum(price) from user_items where user_id = v_uid), 0) into v_left from wallets w where w.user_id = v_uid;
  if v_left < c_price then raise exception 'Не хватает Coins'; end if;
  select si.id into v_item from shop_items si
  where si.price between 100 and 500 and si.min_tier <= aura_tier(v_w.peak)
    and not exists (select 1 from user_items ui where ui.user_id = v_uid and ui.item_id = si.id)
  order by random() limit 1;
  if v_item is null then raise exception 'В сундуке закончились предметы для тебя'; end if;
  insert into user_items (user_id, item_id, price) values (v_uid, v_item, c_price);
  return v_item;
end $$;

revoke execute on function public.open_chest() from public;
grant execute on function public.open_chest() to authenticated;
