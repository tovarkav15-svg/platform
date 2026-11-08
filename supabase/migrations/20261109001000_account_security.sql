-- Безопасность аккаунта, как в Telegram, WhatsApp и Discord:
--   • «Устройства»: где открыт аккаунт, с какого браузера и когда был активен; можно закрыть любой сеанс или все чужие;
--   • журнал входов с устройством и адресом (виден самому человеку и модераторам);
--   • запасная почта и одноразовые коды восстановления — по ним модератор точно узнаёт владельца.

-- ============ Устройства ============
create or replace function public.my_sessions()
returns table (id uuid, user_agent text, ip text, created_at timestamptz, last_active timestamptz, current boolean)
language sql security definer set search_path = public stable as $$
  select s.id, s.user_agent, host(s.ip), s.created_at, coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at),
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s where s.user_id = auth.uid()
  order by 6 desc, 5 desc;
$$;
revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

create or replace function public.end_my_session(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
end $$;
revoke execute on function public.end_my_session(uuid) from public, anon;
grant execute on function public.end_my_session(uuid) to authenticated;

create or replace function public.end_other_sessions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  delete from auth.sessions where user_id = auth.uid() and id::text <> coalesce(auth.jwt() ->> 'session_id', '');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.end_other_sessions() from public, anon;
grant execute on function public.end_other_sessions() to authenticated;

-- ============ Входы с устройством ============
-- Каждый новый сеанс — запись «вход» с браузером и адресом. Старую запись входа по last_sign_in_at убираем, чтобы не двоилось
create or replace function public.ah_auth_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    insert into public.account_history (user_id, kind, old_value, new_value) values (new.id, 'email', old.email, new.email);
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    insert into public.account_history (user_id, kind) values (new.id, 'password');
  end if;
  return new;
end $$;

create or replace function public.ah_auth_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_history (user_id, kind, new_value, note)
  values (new.user_id, 'login', left(coalesce(new.user_agent, ''), 300), coalesce(host(new.ip), ''));
  return new;
end $$;
drop trigger if exists auth_sessions_account_history on auth.sessions;
create trigger auth_sessions_account_history after insert on auth.sessions
  for each row execute function public.ah_auth_sessions();

-- Своя история безопасности: входы, смены пароля, почты, ника, действия модераторов
create or replace function public.my_security_log()
returns table (kind text, old_value text, new_value text, note text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select h.kind, h.old_value, h.new_value, case when h.kind = 'snapshot' then '' else h.note end, h.created_at
  from account_history h
  where h.user_id = auth.uid() and h.kind in ('login', 'password', 'email', 'username', 'recovery', 'created')
  order by h.created_at desc, h.id desc limit 60;
$$;
revoke execute on function public.my_security_log() from public, anon;
grant execute on function public.my_security_log() to authenticated;

-- ============ Запасная почта и коды восстановления ============
create table if not exists public.account_recovery (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  backup_email text check (backup_email is null or (char_length(backup_email) <= 320 and backup_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  codes        text[] not null default '{}',  -- только хэши, сами коды видит один раз владелец
  codes_at     timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.account_recovery enable row level security; -- без политик: только через функции ниже

create or replace function public.my_recovery()
returns table (backup_email text, codes_left int, codes_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.backup_email, coalesce(cardinality(r.codes), 0), r.codes_at from account_recovery r where r.user_id = auth.uid()
  union all select null, 0, null where not exists (select 1 from account_recovery where user_id = auth.uid())
  limit 1;
$$;
revoke execute on function public.my_recovery() from public, anon;
grant execute on function public.my_recovery() to authenticated;

create or replace function public.set_backup_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  if e is not null and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Неверная почта'; end if;
  insert into account_recovery (user_id, backup_email) values (auth.uid(), e)
  on conflict (user_id) do update set backup_email = e, updated_at = now();
  insert into account_history (user_id, kind, new_value, note) values (auth.uid(), 'recovery', e, case when e is null then 'убрал запасную почту' else 'указал запасную почту' end);
end $$;
revoke execute on function public.set_backup_email(text) from public, anon;
grant execute on function public.set_backup_email(text) to authenticated;

-- 8 новых кодов вида ABCD-EFGH; старые перестают работать
create or replace function public.new_recovery_codes() returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare plain text[] := '{}'; hashed text[] := '{}'; c text; i int;
begin
  if auth.uid() is null then raise exception 'Нужно войти'; end if;
  for i in 1..8 loop
    c := upper(substr(translate(encode(gen_random_bytes(12), 'base64'), '+/=0O1Il', ''), 1, 8));
    c := substr(c, 1, 4) || '-' || substr(c, 5, 4);
    plain := plain || c;
    hashed := hashed || crypt(c, gen_salt('bf', 8));
  end loop;
  insert into account_recovery (user_id, codes, codes_at) values (auth.uid(), hashed, now())
  on conflict (user_id) do update set codes = hashed, codes_at = now(), updated_at = now();
  insert into account_history (user_id, kind, note) values (auth.uid(), 'recovery', 'создал новые коды восстановления');
  return plain;
end $$;
revoke execute on function public.new_recovery_codes() from public, anon;
grant execute on function public.new_recovery_codes() to authenticated;

-- ============ Для модераторов ============
create or replace function public.mod_recovery_info(p_user uuid)
returns table (backup_email text, codes_left int, codes_at timestamptz, devices int)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  return query select r.backup_email, coalesce(cardinality(r.codes), 0), r.codes_at, (select count(*)::int from auth.sessions s where s.user_id = p_user)
    from (select 1) one left join account_recovery r on r.user_id = p_user;
end $$;
revoke execute on function public.mod_recovery_info(uuid) from public, anon;
grant execute on function public.mod_recovery_info(uuid) to authenticated;

-- Человек называет один код — модератор проверяет; верный код сгорает
create or replace function public.mod_check_recovery_code(p_user uuid, p_code text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare r account_recovery; h text; ok boolean := false; c text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if char_length(c) = 8 then c := substr(c, 1, 4) || '-' || substr(c, 5, 4); end if;
  select * into r from account_recovery where user_id = p_user;
  if found then
    foreach h in array r.codes loop
      if crypt(c, h) = h then ok := true; exit; end if;
    end loop;
  end if;
  if ok then update account_recovery set codes = array_remove(codes, h), updated_at = now() where user_id = p_user; end if;
  insert into account_history (user_id, kind, moderator, note) values (p_user, 'recovery', auth.uid(), case when ok then 'код восстановления подтверждён' else 'назван неверный код восстановления' end);
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'check_code', p_user, case when ok then 'верный' else 'неверный' end);
  return ok;
end $$;
revoke execute on function public.mod_check_recovery_code(uuid, text) from public, anon;
grant execute on function public.mod_check_recovery_code(uuid, text) to authenticated;

-- Поиск аккаунта теперь находит и по запасной почте
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
    union all select r.user_id, 'запасная почта' from account_recovery r where lower(r.backup_email) like '%' || q || '%'
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
