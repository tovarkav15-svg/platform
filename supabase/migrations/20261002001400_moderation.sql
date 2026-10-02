-- Мессенджер: изменение и удаление сообщений, блокировка. Модерация: бейджи на проверке, жалобы, баны

-- ============ Модераторы ============
-- Модерируют только владельцы платформы (@fedonko, @awiny). Роль нельзя выдать себе самому (protect_role)
create or replace function public.is_moderator(p_user uuid default auth.uid()) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = p_user and role in ('owner', 'founder'));
$$;
revoke execute on function public.is_moderator(uuid) from public;
grant execute on function public.is_moderator(uuid) to anon, authenticated;

-- ============ Баны ============
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists ban_reason text not null default '' check (char_length(ban_reason) <= 300);

-- Бан нельзя снять или поставить себе, изменив свой профиль
create or replace function public.protect_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' and coalesce(current_setting('app.moderating', true), '') <> 'on' then
    new.role := old.role;
    new.is_support := old.is_support;
    new.banned_until := old.banned_until;
    new.ban_reason := old.ban_reason;
  end if;
  return new;
end $$;

create or replace function public.is_banned(p_user uuid default auth.uid()) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = p_user and banned_until is not null and banned_until > now());
$$;
revoke execute on function public.is_banned(uuid) from public;
grant execute on function public.is_banned(uuid) to anon, authenticated;

-- Забаненный ничего не создаёт и не меняет: сообщения, бейджи, отзывы, работы, проекты, чаты, звонки, дружба
create or replace function public.deny_banned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_banned(auth.uid()) then
    raise exception 'Аккаунт заблокирован модерацией';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages', 'jobs', 'reviews', 'works', 'projects', 'chats', 'calls', 'friendships', 'chat_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_deny_banned', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.deny_banned()', t || '_deny_banned', t);
  end loop;
end $$;

create or replace function public.ban_user(p_user uuid, p_days int default null, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if public.is_moderator(p_user) then raise exception 'Модератора забанить нельзя'; end if;
  perform set_config('app.moderating', 'on', true);
  update profiles set banned_until = case when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end,
                      ban_reason = left(coalesce(p_reason, ''), 300)
  where id = p_user;
  -- Бейджи забаненного снимаем с биржи
  update jobs set active = false where user_id = p_user;
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'ban', p_user, coalesce(p_reason, '') || case when p_days is null then ' · навсегда' else ' · ' || p_days || ' дн.' end);
end $$;

create or replace function public.unban_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  update profiles set banned_until = null, ban_reason = '' where id = p_user;
  insert into mod_log (moderator, action, target_user) values (auth.uid(), 'unban', p_user);
end $$;

-- Журнал действий модераторов
create table if not exists public.mod_log (
  id          bigint generated always as identity primary key,
  moderator   uuid not null references public.profiles(id) on delete cascade,
  action      text not null,
  target_user uuid references public.profiles(id) on delete set null,
  target_job  uuid,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.mod_log enable row level security;
drop policy if exists "mod_log: модераторы" on public.mod_log;
create policy "mod_log: модераторы" on public.mod_log for select using (public.is_moderator());

-- ============ Бейджи биржи на проверке ============
alter table public.jobs add column if not exists mod_status text not null default 'pending' check (mod_status in ('pending', 'approved', 'rejected'));
alter table public.jobs add column if not exists mod_note text not null default '' check (char_length(mod_note) <= 300);
-- Уже висящие бейджи считаем одобренными
update public.jobs set mod_status = 'approved' where mod_status = 'pending' and created_at < now();

-- Любая правка бейджа автором отправляет его на повторную проверку
create or replace function public.jobs_to_review() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.moderating', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.mod_status := 'pending'; new.mod_note := '';
  elsif (new.service, new.niche, new.description, new.avg_check, new.photo_path, new.cases) is distinct from (old.service, old.niche, old.description, old.avg_check, old.photo_path, old.cases) then
    new.mod_status := 'pending'; new.mod_note := '';
  else
    new.mod_status := old.mod_status; new.mod_note := old.mod_note;
  end if;
  return new;
end $$;
drop trigger if exists jobs_to_review on public.jobs;
create trigger jobs_to_review before insert or update on public.jobs for each row execute function public.jobs_to_review();

drop policy if exists "jobs: все читают активные" on public.jobs;
create policy "jobs: все читают одобренные" on public.jobs for select using ((active and mod_status = 'approved') or user_id = auth.uid() or public.is_moderator());

create or replace function public.moderate_job(p_job uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  update jobs set mod_status = case when p_approve then 'approved' else 'rejected' end, mod_note = left(coalesce(p_note, ''), 300) where id = p_job;
  insert into mod_log (moderator, action, target_job, note) values (auth.uid(), case when p_approve then 'approve_job' else 'reject_job' end, p_job, coalesce(p_note, ''));
end $$;

-- ============ Жалобы ============
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_user uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete set null,
  reason      text not null check (char_length(reason) between 1 and 60),
  details     text not null default '' check (char_length(details) <= 600),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  check (reporter <> target_user)
);
create index if not exists reports_open on public.reports(status, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "reports: пишу" on public.reports;
create policy "reports: пишу" on public.reports for insert to authenticated with check (reporter = auth.uid() and status = 'open');
drop policy if exists "reports: свои и модераторы" on public.reports;
create policy "reports: свои и модераторы" on public.reports for select using (reporter = auth.uid() or public.is_moderator());
drop policy if exists "reports: модераторы закрывают" on public.reports;
create policy "reports: модераторы закрывают" on public.reports for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ============ Блокировка ============
create table if not exists public.blocks (
  blocker    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks: свои" on public.blocks;
create policy "blocks: свои" on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create or replace function public.is_blocked_pair(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
revoke execute on function public.is_blocked_pair(uuid, uuid) from public;
grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

-- Писать в личку нельзя, если кто-то из двоих заблокировал другого
create or replace function public.can_post(p_chat uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from chat_members m join chats c on c.id = m.chat_id
                 where m.chat_id = p_chat and m.user_id = auth.uid()
                   and (c.kind <> 'channel' or m.role in ('owner', 'admin')))
     and not exists (select 1 from chats c join chat_members o on o.chat_id = c.id
                     where c.id = p_chat and c.kind = 'dm' and o.user_id <> auth.uid()
                       and (public.in_focus(o.user_id) or public.is_blocked_pair(auth.uid(), o.user_id)))
     and not public.in_focus(auth.uid());
$$;

drop policy if exists "calls: звоню в свою личку" on public.calls;
create policy "calls: звоню в свою личку" on public.calls for insert to authenticated with check (
  caller = auth.uid() and callee <> caller
  and exists (select 1 from chats c where c.id = chat_id and c.kind = 'dm')
  and exists (select 1 from chat_members a where a.chat_id = calls.chat_id and a.user_id = caller)
  and exists (select 1 from chat_members b where b.chat_id = calls.chat_id and b.user_id = callee)
  and not public.in_focus(callee) and not public.in_focus(caller)
  and not public.is_blocked_pair(caller, callee)
);

-- ============ Изменение и удаление сообщений ============
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

create or replace function public.edit_message(p_id uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_id;
  if not found or m.sender_id <> auth.uid() then raise exception 'Можно менять только свои сообщения'; end if;
  if m.kind <> 'text' or m.deleted_at is not null then raise exception 'Это сообщение нельзя изменить'; end if;
  if m.created_at < now() - interval '48 hours' then raise exception 'Менять можно в течение 48 часов'; end if;
  if char_length(trim(p_text)) not between 1 and 2000 then raise exception 'Пустое сообщение'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован модерацией'; end if;
  update messages set text = p_text, edited_at = now() where id = p_id;
end $$;

-- Удалить своё может автор; в группе и канале — ещё админы чата; модераторы — любое
create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_id;
  if not found then return; end if;
  if not (m.sender_id = auth.uid() or public.is_moderator()
          or exists (select 1 from chat_members cm join chats c on c.id = cm.chat_id where cm.chat_id = m.chat_id and cm.user_id = auth.uid() and cm.role in ('owner', 'admin') and c.kind in ('group', 'channel'))) then
    raise exception 'Нельзя удалить это сообщение';
  end if;
  update messages set deleted_at = now(), text = '·', media_path = null, media_meta = '{}'::jsonb where id = p_id;
end $$;

revoke execute on function public.edit_message(uuid, text), public.delete_message(uuid), public.ban_user(uuid, int, text), public.unban_user(uuid), public.moderate_job(uuid, boolean, text) from public;
grant execute on function public.edit_message(uuid, text), public.delete_message(uuid), public.ban_user(uuid, int, text), public.unban_user(uuid), public.moderate_job(uuid, boolean, text) to authenticated;

-- Новый личный чат с тем, кто тебя заблокировал (или кого ты), не создаётся
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
    if public.is_blocked_pair(me, p_user) then raise exception 'Переписка недоступна: один из вас заблокировал другого'; end if;
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
