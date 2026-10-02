-- Анимации поверх баннера, живые сцены вместо баннера, настройки приватности

-- ============ Магазин ============
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('banner', 'ring', 'name', 'title', 'bg', 'overlay', 'scene'));
alter table public.profile_deco add column if not exists overlay text references public.shop_items(id);
alter table public.profile_deco add column if not exists scene text references public.shop_items(id);

insert into public.shop_items (id, kind, name, price, min_tier, sort) values
  ('o-mist',      'overlay', 'Туман',              150, 0, 1),
  ('o-sakura',    'overlay', 'Лепестки сакуры',    300, 0, 2),
  ('o-snow',      'overlay', 'Снег',               250, 0, 3),
  ('o-rain',      'overlay', 'Ливень',             300, 1, 4),
  ('o-stars',     'overlay', 'Мерцание',           350, 1, 5),
  ('o-leaves',    'overlay', 'Осенние листья',     400, 1, 6),
  ('o-embers',    'overlay', 'Искры костра',       400, 1, 7),
  ('o-rays',      'overlay', 'Солнечные лучи',     450, 1, 8),
  ('o-fireflies', 'overlay', 'Светлячки',          500, 2, 9),
  ('o-birds',     'overlay', 'Стая птиц',          550, 2, 10),
  ('s-winter',    'scene',   'Зимний лес',         700, 2, 1),
  ('s-field',     'scene',   'Поле на закате',     800, 2, 2),
  ('s-fjord',     'scene',   'Северный фьорд',     900, 2, 3),
  ('s-sea',       'scene',   'Море викингов',     1100, 3, 4),
  ('s-aurora',    'scene',   'Полярная ночь',     1200, 3, 5)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort;

create or replace function public.equip_item(p_kind text, p_item text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Нужно войти'; end if;
  if p_kind not in ('banner', 'ring', 'name', 'title', 'bg', 'overlay', 'scene') then raise exception 'Неизвестный слот'; end if;
  if p_item is not null and not exists (
    select 1 from user_items ui join shop_items si on si.id = ui.item_id where ui.user_id = v_uid and ui.item_id = p_item and si.kind = p_kind
  ) then raise exception 'Этого предмета нет в коллекции'; end if;
  insert into profile_deco (user_id) values (v_uid) on conflict (user_id) do nothing;
  update profile_deco set
    banner  = case when p_kind = 'banner'  then p_item else banner end,
    ring    = case when p_kind = 'ring'    then p_item else ring end,
    name_fx = case when p_kind = 'name'    then p_item else name_fx end,
    title   = case when p_kind = 'title'   then p_item else title end,
    page_bg = case when p_kind = 'bg'      then p_item else page_bg end,
    overlay = case when p_kind = 'overlay' then p_item else overlay end,
    scene   = case when p_kind = 'scene'   then p_item else scene end,
    updated_at = now()
  where user_id = v_uid;
end $$;

-- ============ Приватность ============
alter table public.profiles add column if not exists dm_policy text not null default 'all' check (dm_policy in ('all', 'friends'));
alter table public.profiles add column if not exists discoverable boolean not null default true;

-- Новый личный чат: если человек принимает сообщения только от друзей, незнакомцу не создаём.
-- Уже начатые чаты продолжают работать; команда платформы может написать всегда
create or replace function public.get_or_create_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null or p_user = me or not exists (select 1 from profiles where id = p_user) then
    raise exception 'bad user';
  end if;
  k := least(me::text, p_user::text) || ':' || greatest(me::text, p_user::text);
  select id into cid from chats where dm_key = k;
  if cid is null then
    if (select dm_policy from profiles where id = p_user) = 'friends'
       and not exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester = me and f.addressee = p_user) or (f.requester = p_user and f.addressee = me)))
       and not exists (select 1 from profiles where id = me and (is_support or role in ('owner', 'founder'))) then
      raise exception 'Этот человек принимает сообщения только от друзей. Отправь заявку в друзья';
    end if;
    insert into chats (dm_key) values (k) on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from chats where dm_key = k; end if;
    insert into chat_members (chat_id, user_id) values (cid, me), (cid, p_user) on conflict do nothing;
  end if;
  return cid;
end $$;
