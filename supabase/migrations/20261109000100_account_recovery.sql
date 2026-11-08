-- Восстановление аккаунтов, как в крупных мессенджерах: у каждого аккаунта есть история
-- (регистрация, смены ника, почты, пароля, входы), а удалённые аккаунты сохраняются в архиве.
-- Если аккаунт угнали или человек потерял доступ, модератор находит его по старому нику или старой почте,
-- сверяет историю с тем, что рассказывает человек, и возвращает доступ.
-- Читать всё это могут только модераторы.

-- ============ История аккаунта ============
-- user_id без внешнего ключа: история остаётся, даже если аккаунт удалён
create table if not exists public.account_history (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null check (kind in ('snapshot', 'created', 'username', 'display_name', 'telegram', 'email', 'password', 'login', 'deleted', 'recovery')),
  old_value  text,
  new_value  text,
  moderator  uuid,
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists account_history_user on public.account_history (user_id, created_at desc);
create index if not exists account_history_values on public.account_history (lower(old_value), lower(new_value));
alter table public.account_history enable row level security;
drop policy if exists "account_history: модераторы" on public.account_history;
create policy "account_history: модераторы" on public.account_history for select using (public.is_moderator());

-- ============ Архив удалённых аккаунтов ============
create table if not exists public.account_archive (
  user_id      uuid primary key,
  username     text,
  display_name text,
  email        text,
  telegram     text,
  registered   timestamptz,
  last_login   timestamptz,
  profile      jsonb,
  deleted_at   timestamptz not null default now()
);
alter table public.account_archive enable row level security;
drop policy if exists "account_archive: модераторы" on public.account_archive;
create policy "account_archive: модераторы" on public.account_archive for select using (public.is_moderator());

-- ============ Запись событий ============
create or replace function public.ah_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into account_history (user_id, kind, new_value) values (new.id, 'created', new.username);
    return new;
  end if;
  if new.username is distinct from old.username then
    insert into account_history (user_id, kind, old_value, new_value) values (new.id, 'username', old.username, new.username);
  end if;
  if new.display_name is distinct from old.display_name then
    insert into account_history (user_id, kind, old_value, new_value) values (new.id, 'display_name', old.display_name, new.display_name);
  end if;
  if new.telegram is distinct from old.telegram then
    insert into account_history (user_id, kind, old_value, new_value) values (new.id, 'telegram', old.telegram, new.telegram);
  end if;
  return new;
end $$;
drop trigger if exists profiles_account_history on public.profiles;
create trigger profiles_account_history after insert or update of username, display_name, telegram on public.profiles
  for each row execute function public.ah_profiles();

-- Почта, пароль и входы — из системной таблицы аккаунтов. Сам пароль не сохраняется, только факт смены
create or replace function public.ah_auth_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    insert into public.account_history (user_id, kind, old_value, new_value) values (new.id, 'email', old.email, new.email);
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.account_history (user_id, kind) values (new.id, 'password');
  end if;
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    insert into public.account_history (user_id, kind) values (new.id, 'login');
  end if;
  return new;
end $$;
drop trigger if exists auth_users_account_history on auth.users;
create trigger auth_users_account_history after update on auth.users
  for each row execute function public.ah_auth_users();

-- Перед удалением аккаунта — снимок в архив
create or replace function public.ah_auth_users_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = old.id;
  insert into public.account_archive (user_id, username, display_name, email, telegram, registered, last_login, profile)
  values (old.id, p.username, p.display_name, old.email, p.telegram, old.created_at, old.last_sign_in_at, to_jsonb(p))
  on conflict (user_id) do update set username = excluded.username, display_name = excluded.display_name, email = excluded.email,
    telegram = excluded.telegram, last_login = excluded.last_login, profile = excluded.profile, deleted_at = now();
  insert into public.account_history (user_id, kind, old_value) values (old.id, 'deleted', p.username);
  return old;
end $$;
drop trigger if exists auth_users_archive on auth.users;
create trigger auth_users_archive before delete on auth.users
  for each row execute function public.ah_auth_users_delete();

-- Стартовый снимок всех нынешних аккаунтов: ник, почта, телеграм, дата регистрации
insert into public.account_history (user_id, kind, new_value, note, created_at)
select u.id, 'snapshot', p.username, concat_ws(' · ', 'почта: ' || u.email, nullif('telegram: ' || nullif(p.telegram, ''), '')), u.created_at
from auth.users u left join public.profiles p on p.id = u.id
where not exists (select 1 from public.account_history h where h.user_id = u.id);

-- ============ Поиск для модераторов ============
-- Ищет по нынешнему и старым никам, почтам, телеграму и имени, включая удалённые аккаунты
create or replace function public.mod_account_lookup(p_q text)
returns table (user_id uuid, username text, display_name text, email text, telegram text, registered timestamptz, last_login timestamptz,
               banned_until timestamptz, deleted_at timestamptz, matched text)
language plpgsql security definer set search_path = public stable as $$
declare q text := lower(trim(regexp_replace(coalesce(p_q, ''), '^@', '')));
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if char_length(q) < 2 then return; end if;
  return query
  with hits as (
    select p.id, 'ник или имя' as why from profiles p where lower(p.username) like '%' || q || '%' or lower(p.display_name) like '%' || q || '%'
    union all select u.id, 'почта' from auth.users u where lower(u.email) like '%' || q || '%'
    union all select p.id, 'телеграм' from profiles p where lower(p.telegram) like '%' || q || '%'
    union all select h.user_id, case h.kind when 'username' then 'старый ник' when 'email' then 'старая почта' when 'telegram' then 'старый телеграм' else 'история' end
      from account_history h where h.kind in ('username', 'email', 'telegram', 'display_name', 'snapshot', 'created')
      and (lower(h.old_value) like '%' || q || '%' or lower(h.new_value) like '%' || q || '%' or lower(h.note) like '%' || q || '%')
    union all select a.user_id, 'удалённый аккаунт' from account_archive a
      where lower(a.username) like '%' || q || '%' or lower(a.email) like '%' || q || '%' or lower(a.telegram) like '%' || q || '%'
  ), ids as (select id, string_agg(distinct why, ', ') as why from hits group by id)
  select ids.id, coalesce(p.username, a.username)::text, coalesce(p.display_name, a.display_name)::text, coalesce(u.email, a.email)::text, coalesce(p.telegram, a.telegram)::text,
         coalesce(u.created_at, a.registered), coalesce(u.last_sign_in_at, a.last_login), p.banned_until,
         case when u.id is null then a.deleted_at end, ids.why::text
  from ids
  left join profiles p on p.id = ids.id
  left join auth.users u on u.id = ids.id
  left join account_archive a on a.user_id = ids.id
  where p.id is not null or a.user_id is not null
  order by coalesce(u.last_sign_in_at, a.last_login) desc nulls last
  limit 30;
end $$;
revoke execute on function public.mod_account_lookup(text) from public, anon;
grant execute on function public.mod_account_lookup(text) to authenticated;

-- История одного аккаунта (каждый просмотр записывается в журнал модерации)
create or replace function public.mod_account_history(p_user uuid)
returns setof public.account_history
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if exists (select 1 from profiles where id = p_user) then
    insert into mod_log (moderator, action, target_user) values (auth.uid(), 'account_view', p_user);
  end if;
  return query select * from account_history where user_id = p_user order by created_at desc, id desc limit 300;
end $$;
revoke execute on function public.mod_account_history(uuid) from public, anon;
grant execute on function public.mod_account_history(uuid) to authenticated;

-- Если аккаунт угнали: выкинуть всех со всех устройств
create or replace function public.mod_end_sessions(p_user uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if public.is_moderator(p_user) and p_user <> auth.uid() then raise exception 'Нельзя для другого модератора'; end if;
  delete from auth.sessions where user_id = p_user;
  insert into account_history (user_id, kind, moderator, note) values (p_user, 'recovery', auth.uid(), concat_ws(' · ', 'вышел на всех устройствах', nullif(left(p_note, 300), '')));
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'end_sessions', p_user, left(coalesce(p_note, ''), 300));
end $$;
revoke execute on function public.mod_end_sessions(uuid, text) from public, anon;
grant execute on function public.mod_end_sessions(uuid, text) to authenticated;

-- То же для серверной функции восстановления (вызывается только с серверным ключом)
create or replace function public.mod_end_sessions_service(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from auth.sessions where user_id = p_user;
$$;
revoke execute on function public.mod_end_sessions_service(uuid) from public, anon, authenticated;
grant execute on function public.mod_end_sessions_service(uuid) to service_role;
