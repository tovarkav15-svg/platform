-- Раньше login_email отдавала почту по любому юзернейму без входа: можно было собрать почты всех.
-- Теперь почта возвращается только вместе с верным паролем, а попытки по одному юзернейму ограничены.
-- Сброс пароля по юзернейму идёт через серверную функцию reset-password, почту она наружу не отдаёт.

create table if not exists public.login_attempts (
  username text not null,
  at       timestamptz not null default now()
);
create index if not exists login_attempts_username_at on public.login_attempts (username, at);
alter table public.login_attempts enable row level security;
-- Политик нет намеренно: таблица только для функции ниже

drop function if exists public.login_email(text);

create or replace function public.login_email(p_username text, p_password text) returns text
language plpgsql volatile security definer set search_path = public, auth, extensions as $$
declare
  v_name text := lower(trim(leading '@' from trim(coalesce(p_username, ''))));
  v_email text; v_hash text; n int;
begin
  if v_name = '' or coalesce(p_password, '') = '' then return null; end if;
  delete from login_attempts where at < now() - interval '1 day';
  select count(*) into n from login_attempts where username = v_name and at > now() - interval '15 minutes';
  if n >= 10 then raise exception 'Слишком много попыток входа. Подожди 15 минут'; end if;
  insert into login_attempts (username) values (v_name);

  select u.email, u.encrypted_password into v_email, v_hash
  from auth.users u join public.profiles p on p.id = u.id
  where p.username = v_name limit 1;

  if v_hash is null or v_hash = '' or extensions.crypt(p_password, v_hash) <> v_hash then return null; end if;
  delete from login_attempts where username = v_name;
  return v_email;
end $$;

revoke execute on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;
