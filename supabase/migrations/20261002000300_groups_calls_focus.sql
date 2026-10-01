-- Группы, каналы, поддержка, звонки, режим фокуса, персонализация профиля

-- ============ Чаты: виды и оформление ============
alter table public.chats
  add column if not exists kind        text not null default 'dm' check (kind in ('dm', 'group', 'channel', 'support')),
  add column if not exists title       text not null default '' check (char_length(title) <= 60),
  add column if not exists description text not null default '' check (char_length(description) <= 300),
  add column if not exists avatar      text check (avatar is null or char_length(avatar) <= 300000),
  add column if not exists accent      text not null default 'ai' check (char_length(accent) <= 20),
  add column if not exists emoji       text not null default '' check (char_length(emoji) <= 8),
  add column if not exists owner_id    uuid references public.profiles(id) on delete set null,
  add column if not exists is_public   boolean not null default false,
  add column if not exists support_for uuid references public.profiles(id) on delete cascade;
create unique index if not exists chats_support_one on public.chats(support_for) where kind = 'support';

alter table public.chat_members
  add column if not exists role text not null default 'member' check (role in ('owner', 'admin', 'member'));

-- Системные сообщения (приветствие поддержки, «добавил в группу»)
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'voice', 'file', 'system'));
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (char_length(text) <= 2000 and (kind not in ('text', 'system') or char_length(trim(text)) >= 1));
alter table public.messages drop constraint if exists messages_media_check;
alter table public.messages add constraint messages_media_check
  check (kind in ('text', 'system') or (media_path is not null and split_part(media_path, '/', 1) = chat_id::text));

-- ============ Профиль: фокус и персонализация ============
alter table public.profiles
  add column if not exists focus_until timestamptz,
  add column if not exists avatar_ring text not null default 'spin' check (avatar_ring in ('spin', 'neon', 'solid', 'none')),
  add column if not exists name_style  text not null default 'plain' check (name_style in ('plain', 'gradient', 'outline')),
  add column if not exists emoji       text not null default '' check (char_length(emoji) <= 8),
  add column if not exists page_bg     text not null default 'aurora' check (page_bg in ('aurora', 'plain', 'dots'));

create or replace function public.in_focus(p_user uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select focus_until > now() from profiles where id = p_user), false);
$$;

create or replace function public.chat_role(p_chat uuid) returns text
language sql security definer set search_path = public stable as $$
  select role from chat_members where chat_id = p_chat and user_id = auth.uid();
$$;

-- Можно ли мне писать в этот чат: в канал — только админам, в личку — если собеседник не в фокусе
create or replace function public.can_post(p_chat uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from chat_members m join chats c on c.id = m.chat_id
                 where m.chat_id = p_chat and m.user_id = auth.uid()
                   and (c.kind <> 'channel' or m.role in ('owner', 'admin')))
     and not exists (select 1 from chats c join chat_members o on o.chat_id = c.id
                     where c.id = p_chat and c.kind = 'dm' and o.user_id <> auth.uid() and public.in_focus(o.user_id))
     and not public.in_focus(auth.uid());
$$;

drop policy if exists "messages: участники пишут" on public.messages;
create policy "messages: участники пишут" on public.messages for insert
  with check (sender_id = auth.uid() and kind <> 'system' and public.can_post(chat_id));

-- Публичные каналы видно всем, остальные чаты — только участникам
drop policy if exists "chats: участники" on public.chats;
create policy "chats: участники" on public.chats for select using (public.is_chat_member(id) or (kind = 'channel' and is_public));

-- Оформление меняют владелец и админы, и только эти поля
revoke update on public.chats from authenticated, anon;
grant update (title, description, avatar, accent, emoji, is_public) on public.chats to authenticated;
drop policy if exists "chats: админы оформляют" on public.chats;
create policy "chats: админы оформляют" on public.chats for update to authenticated
  using (kind in ('group', 'channel') and public.chat_role(id) in ('owner', 'admin'))
  with check (kind in ('group', 'channel') and char_length(trim(title)) >= 1);

-- Участник может отметить прочтение у себя, остальное — через функции ниже
revoke update on public.chat_members from authenticated, anon;
grant update (last_read_at) on public.chat_members to authenticated;

-- ============ Функции для групп и каналов ============
create or replace function public.create_chat(p_kind text, p_title text, p_description text, p_accent text, p_emoji text, p_avatar text, p_public boolean, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_kind not in ('group', 'channel') then raise exception 'bad kind'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 1 then raise exception 'title required'; end if;
  insert into chats (kind, title, description, accent, emoji, avatar, is_public, owner_id)
  values (p_kind, left(trim(p_title), 60), left(coalesce(p_description, ''), 300), coalesce(nullif(p_accent, ''), 'ai'), left(coalesce(p_emoji, ''), 8), p_avatar, p_kind = 'channel' and coalesce(p_public, false), me)
  returning id into cid;
  insert into chat_members (chat_id, user_id, role, last_read_at) values (cid, me, 'owner', now());
  insert into chat_members (chat_id, user_id)
    select cid, u from unnest(coalesce(p_members, '{}')) u where u <> me and exists (select 1 from profiles where id = u)
    limit 200
  on conflict do nothing;
  insert into messages (chat_id, sender_id, kind, text) values (cid, me, 'system', case when p_kind = 'channel' then 'Канал создан' else 'Группа создана' end);
  return cid;
end $$;

create or replace function public.add_members(p_chat uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.chat_role(p_chat) not in ('owner', 'admin') then raise exception 'not allowed'; end if;
  if not exists (select 1 from chats where id = p_chat and kind in ('group', 'channel')) then raise exception 'bad chat'; end if;
  insert into chat_members (chat_id, user_id)
    select p_chat, u from unnest(p_users) u where exists (select 1 from profiles where id = u)
  on conflict do nothing;
end $$;

create or replace function public.join_channel(p_chat uuid) returns void
language sql security definer set search_path = public as $$
  insert into chat_members (chat_id, user_id)
  select id, auth.uid() from chats where id = p_chat and kind = 'channel' and is_public
  on conflict do nothing;
$$;

create or replace function public.remove_member(p_chat uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.chat_role(p_chat) not in ('owner', 'admin') then raise exception 'not allowed'; end if;
  delete from chat_members where chat_id = p_chat and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.set_member_role(p_chat uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.chat_role(p_chat) <> 'owner' or p_role not in ('admin', 'member') or p_user = auth.uid() then raise exception 'not allowed'; end if;
  update chat_members set role = p_role where chat_id = p_chat and user_id = p_user;
end $$;

-- Выйти: владелец передаёт чат самому старому участнику, последний вышедший удаляет чат
create or replace function public.leave_chat(p_chat uuid) returns void
language plpgsql security definer set search_path = public as $$
declare was text; heir uuid;
begin
  select role into was from chat_members where chat_id = p_chat and user_id = auth.uid();
  if was is null then return; end if;
  if exists (select 1 from chats where id = p_chat and kind in ('dm', 'support')) then raise exception 'cannot leave'; end if;
  delete from chat_members where chat_id = p_chat and user_id = auth.uid();
  if was = 'owner' then
    select user_id into heir from chat_members where chat_id = p_chat order by (role = 'admin') desc, last_read_at limit 1;
    if heir is null then delete from chats where id = p_chat;
    else update chat_members set role = 'owner' where chat_id = p_chat and user_id = heir; update chats set owner_id = heir where id = p_chat;
    end if;
  end if;
end $$;

-- ============ Поддержка: у каждого свой чат с командой ============
create or replace function public.open_support() returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into cid from chats where kind = 'support' and support_for = me;
  if cid is not null then return cid; end if;
  insert into chats (kind, title, support_for, accent) values ('support', 'Поддержка', me, 'brand') returning id into cid;
  insert into chat_members (chat_id, user_id, role, last_read_at) values (cid, me, 'member', now());
  insert into chat_members (chat_id, user_id, role)
    select cid, id, 'admin' from profiles where username in ('fedonko', 'awiny') and id <> me
  on conflict do nothing;
  insert into messages (chat_id, sender_id, kind, text)
    values (cid, me, 'system', 'Это чат с командой платформы. Опиши, что случилось или что хочешь предложить, мы ответим здесь.');
  return cid;
end $$;

-- ============ Список чатов для всех видов ============
drop function if exists public.list_chats();
create or replace function public.list_chats() returns table (
  chat_id uuid, kind text, title text, avatar text, accent text, emoji text, is_public boolean, support_for uuid,
  other_id uuid, other_username text, other_name text, other_avatar text, other_accent text,
  member_count int, my_role text, last_text text, last_kind text, last_mine boolean, last_sender text, last_at timestamptz, unread int, updated_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select c.id, c.kind,
         case when c.kind = 'support' and c.support_for <> auth.uid() then 'Поддержка · @' || sp.username else c.title end,
         c.avatar, c.accent, c.emoji, c.is_public, c.support_for,
         op.id, op.username, op.display_name, op.avatar, op.accent,
         (select count(*)::int from chat_members x where x.chat_id = c.id),
         me.role,
         lm.text, lm.kind, lm.sender_id = auth.uid(), ls.display_name, lm.created_at,
         (select count(*)::int from messages m where m.chat_id = c.id and m.sender_id <> auth.uid() and m.kind <> 'system' and m.created_at > me.last_read_at),
         c.updated_at
  from chat_members me
  join chats c on c.id = me.chat_id
  left join lateral (select p.* from chat_members o join profiles p on p.id = o.user_id
                     where c.kind = 'dm' and o.chat_id = c.id and o.user_id <> me.user_id limit 1) op on true
  left join profiles sp on sp.id = c.support_for
  left join lateral (select text, kind, sender_id, created_at from messages m where m.chat_id = c.id order by created_at desc limit 1) lm on true
  left join profiles ls on ls.id = lm.sender_id
  where me.user_id = auth.uid()
  order by (c.kind = 'support') desc, c.updated_at desc;
$$;

-- Публичные каналы, на которые можно подписаться
create or replace function public.public_channels() returns table (chat_id uuid, title text, description text, avatar text, accent text, emoji text, member_count int, joined boolean)
language sql security definer set search_path = public stable as $$
  select c.id, c.title, c.description, c.avatar, c.accent, c.emoji,
         (select count(*)::int from chat_members x where x.chat_id = c.id),
         exists (select 1 from chat_members x where x.chat_id = c.id and x.user_id = auth.uid())
  from chats c where c.kind = 'channel' and c.is_public order by c.updated_at desc limit 50;
$$;

-- Участники чата с профилями
create or replace function public.chat_people(p_chat uuid) returns table (user_id uuid, role text, username text, display_name text, avatar text, accent text, user_role text)
language sql security definer set search_path = public stable as $$
  select m.user_id, m.role, p.username, p.display_name, p.avatar, p.accent, p.role
  from chat_members m join profiles p on p.id = m.user_id
  where m.chat_id = p_chat and public.is_chat_member(p_chat)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.display_name;
$$;

-- ============ Звонки 1 на 1 ============
create table if not exists public.calls (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.chats(id) on delete cascade,
  caller     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  callee     uuid not null references public.profiles(id) on delete cascade,
  video      boolean not null default false,
  status     text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'declined', 'missed')),
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);
create table if not exists public.call_signals (
  id         bigint generated always as identity primary key,
  call_id    uuid not null references public.calls(id) on delete cascade,
  sender     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists call_signals_call on public.call_signals(call_id, id);

alter table public.calls enable row level security;
alter table public.call_signals enable row level security;

drop policy if exists "calls: участники видят" on public.calls;
create policy "calls: участники видят" on public.calls for select using (auth.uid() in (caller, callee));
drop policy if exists "calls: звоню в свою личку" on public.calls;
create policy "calls: звоню в свою личку" on public.calls for insert to authenticated with check (
  caller = auth.uid() and callee <> caller
  and exists (select 1 from chats c where c.id = chat_id and c.kind = 'dm')
  and exists (select 1 from chat_members a where a.chat_id = calls.chat_id and a.user_id = caller)
  and exists (select 1 from chat_members b where b.chat_id = calls.chat_id and b.user_id = callee)
  and not public.in_focus(callee) and not public.in_focus(caller)
);
revoke update on public.calls from authenticated, anon;
grant update (status, ended_at) on public.calls to authenticated;
drop policy if exists "calls: участники меняют статус" on public.calls;
create policy "calls: участники меняют статус" on public.calls for update to authenticated using (auth.uid() in (caller, callee)) with check (auth.uid() in (caller, callee));

drop policy if exists "signals: участники" on public.call_signals;
create policy "signals: участники" on public.call_signals for select using (exists (select 1 from calls c where c.id = call_id and auth.uid() in (c.caller, c.callee)));
drop policy if exists "signals: участники шлют" on public.call_signals;
create policy "signals: участники шлют" on public.call_signals for insert to authenticated with check (
  sender = auth.uid() and exists (select 1 from calls c where c.id = call_id and auth.uid() in (c.caller, c.callee) and c.status in ('ringing', 'active'))
);

do $$ begin alter publication supabase_realtime add table public.calls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.call_signals; exception when duplicate_object then null; end $$;

-- ============ Права на функции ============
revoke execute on function public.in_focus(uuid), public.chat_role(uuid), public.can_post(uuid), public.create_chat(text, text, text, text, text, text, boolean, uuid[]),
  public.add_members(uuid, uuid[]), public.join_channel(uuid), public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, text),
  public.leave_chat(uuid), public.open_support(), public.list_chats(), public.public_channels(), public.chat_people(uuid) from public, anon;
grant execute on function public.in_focus(uuid), public.chat_role(uuid), public.can_post(uuid), public.create_chat(text, text, text, text, text, text, boolean, uuid[]),
  public.add_members(uuid, uuid[]), public.join_channel(uuid), public.remove_member(uuid, uuid), public.set_member_role(uuid, uuid, text),
  public.leave_chat(uuid), public.open_support(), public.list_chats(), public.public_channels(), public.chat_people(uuid) to authenticated;
