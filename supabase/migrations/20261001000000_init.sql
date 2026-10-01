-- Схема платформы для Supabase.
-- Запуск: Supabase → SQL Editor → New query → вставить весь файл → Run.
-- Скрипт можно запускать повторно.

-- ============ Профили ============
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9]([a-z0-9]|[._](?![._]))*[a-z0-9]$' and char_length(username) between 3 and 20),
  display_name text not null check (char_length(display_name) between 2 and 40),
  bio          text not null default '' check (char_length(bio) <= 160),
  niches       text not null default '',
  accent       text not null default 'edit',
  cover        text not null default 'light',
  avatar       text check (avatar is null or char_length(avatar) <= 300000),
  telegram     text not null default '',
  website      text not null default '',
  role         text not null default 'user',
  created_at   timestamptz not null default now()
);

-- Почта для связи: видит только владелец
create table if not exists public.private_info (
  id    uuid primary key references public.profiles(id) on delete cascade,
  email text not null default ''
);

-- Доход: владелец видит всегда, остальные — только если он сам открыл
create table if not exists public.earnings (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  amount    bigint not null default 0 check (amount >= 0),
  goal      bigint not null default 0 check (goal >= 0),
  is_public boolean not null default false
);

-- Профиль создаётся вместе с аккаунтом из данных регистрации
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, niches)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username'),
    coalesce(new.raw_user_meta_data->>'niches', '')
  );
  insert into public.private_info (id, email) values (new.id, coalesce(new.raw_user_meta_data->>'contact_email', ''));
  insert into public.earnings (user_id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Роль меняется только через SQL Editor, не с сайта
create or replace function public.protect_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    new.role := old.role;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

alter table public.profiles enable row level security;
alter table public.private_info enable row level security;
alter table public.earnings enable row level security;

drop policy if exists "profiles: все читают" on public.profiles;
create policy "profiles: все читают" on public.profiles for select using (true);
drop policy if exists "profiles: свой меняю" on public.profiles;
create policy "profiles: свой меняю" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "private: только я" on public.private_info;
create policy "private: только я" on public.private_info for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "earnings: я или открыто" on public.earnings;
create policy "earnings: я или открыто" on public.earnings for select using (user_id = auth.uid() or is_public);
drop policy if exists "earnings: свой меняю" on public.earnings;
create policy "earnings: свой меняю" on public.earnings for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Вход по юзернейму или почте: возвращает технический адрес аккаунта
-- (вида u…@users.platforma.app, это не настоящая почта, поэтому ничего не раскрывает)
create or replace function public.login_email(p_username text) returns text
language sql security definer set search_path = public, auth stable as $$
  select u.email from auth.users u
  join public.profiles p on p.id = u.id
  left join public.private_info pi on pi.id = u.id
  where p.username = lower(trim(leading '@' from trim(p_username)))
     or (position('@' in trim(p_username)) > 1 and pi.email = lower(trim(p_username)))
  limit 1;
$$;
grant execute on function public.login_email(text) to anon, authenticated;

-- ============ Друзья ============
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.profiles(id) on delete cascade,
  addressee  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee),
  unique (requester, addressee)
);
alter table public.friendships enable row level security;

drop policy if exists "friendships: участники видят" on public.friendships;
create policy "friendships: участники видят" on public.friendships for select
  using (auth.uid() in (requester, addressee));
drop policy if exists "friendships: участники удаляют" on public.friendships;
create policy "friendships: участники удаляют" on public.friendships for delete
  using (auth.uid() in (requester, addressee));

-- Отправить заявку (встречная заявка сразу превращается в дружбу)
create or replace function public.send_friend_request(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user = me then return; end if;
  update friendships set status = 'accepted' where requester = p_user and addressee = me and status = 'pending';
  if found then return; end if;
  insert into friendships (requester, addressee) values (me, p_user) on conflict do nothing;
end $$;

create or replace function public.accept_friend_request(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update friendships set status = 'accepted' where requester = p_user and addressee = auth.uid() and status = 'pending';
$$;

create or replace function public.remove_friend(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid());
$$;

create or replace function public.friend_count(p_user uuid) returns int
language sql security definer set search_path = public stable as $$
  select count(*)::int from friendships where status = 'accepted' and p_user in (requester, addressee);
$$;

grant execute on function public.send_friend_request(uuid), public.accept_friend_request(uuid), public.remove_friend(uuid) to authenticated;
grant execute on function public.friend_count(uuid) to anon, authenticated;

-- ============ Чаты ============
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  dm_key     text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  chat_id      uuid not null references public.chats(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user on public.chat_members(user_id);
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  text       text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_time on public.messages(chat_id, created_at);

create or replace function public.is_chat_member(p_chat uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from chat_members where chat_id = p_chat and user_id = auth.uid());
$$;

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "chats: участники" on public.chats;
create policy "chats: участники" on public.chats for select using (public.is_chat_member(id));
drop policy if exists "members: участники видят" on public.chat_members;
create policy "members: участники видят" on public.chat_members for select using (public.is_chat_member(chat_id));
drop policy if exists "members: отмечаю прочтение" on public.chat_members;
create policy "members: отмечаю прочтение" on public.chat_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "messages: участники читают" on public.messages;
create policy "messages: участники читают" on public.messages for select using (public.is_chat_member(chat_id));
drop policy if exists "messages: участники пишут" on public.messages;
create policy "messages: участники пишут" on public.messages for insert
  with check (sender_id = auth.uid() and public.is_chat_member(chat_id));

create or replace function public.bump_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chats set updated_at = new.created_at where id = new.chat_id;
  update chat_members set last_read_at = new.created_at where chat_id = new.chat_id and user_id = new.sender_id;
  return new;
end $$;
drop trigger if exists messages_bump_chat on public.messages;
create trigger messages_bump_chat after insert on public.messages for each row execute function public.bump_chat();

-- Личный чат с человеком: находит или создаёт
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
    insert into chats (dm_key) values (k) on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from chats where dm_key = k; end if;
    insert into chat_members (chat_id, user_id) values (cid, me), (cid, p_user) on conflict do nothing;
  end if;
  return cid;
end $$;

-- Список моих чатов: собеседник, последнее сообщение, непрочитанные
create or replace function public.list_chats() returns table (
  chat_id uuid, other_id uuid, other_username text, other_name text, other_avatar text, other_accent text,
  last_text text, last_mine boolean, last_at timestamptz, unread int, updated_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select c.id, p.id, p.username, p.display_name, p.avatar, p.accent,
         lm.text, lm.sender_id = auth.uid(), lm.created_at,
         (select count(*)::int from messages m where m.chat_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at),
         c.updated_at
  from chat_members me
  join chats c on c.id = me.chat_id
  join chat_members om on om.chat_id = c.id and om.user_id <> me.user_id
  join profiles p on p.id = om.user_id
  left join lateral (select text, sender_id, created_at from messages m where m.chat_id = c.id order by created_at desc limit 1) lm on true
  where me.user_id = auth.uid()
  order by c.updated_at desc;
$$;

grant execute on function public.get_or_create_dm(uuid), public.list_chats(), public.is_chat_member(uuid) to authenticated;

-- Сообщения приходят мгновенно через Realtime
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ============ Основатели ============
-- После того как @fedonko и @awiny зарегистрируются на сайте, запусти:
-- update public.profiles set role = 'founder' where username in ('fedonko', 'awiny');
