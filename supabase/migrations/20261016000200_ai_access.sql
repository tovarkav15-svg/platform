-- Подключение нейронки (ChatGPT, Claude) к таблице клиентов по личному ключу.
-- В базе лежит только SHA-256 ключа: сам ключ показывается владельцу один раз.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ai_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null default 'Нейронка' check (char_length(trim(name)) between 1 and 40),
  token_hash   text not null unique,
  prefix       text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists ai_tokens_user on public.ai_tokens(user_id, created_at);

alter table public.ai_tokens enable row level security;
-- Свои ключи видно (без самого ключа) и можно отозвать; создаются только через create_ai_token
drop policy if exists "ai_tokens: свои читаю" on public.ai_tokens;
create policy "ai_tokens: свои читаю" on public.ai_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists "ai_tokens: свои удаляю" on public.ai_tokens;
create policy "ai_tokens: свои удаляю" on public.ai_tokens for delete to authenticated using (user_id = auth.uid());

create or replace function public.create_ai_token(p_name text default 'Нейронка') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if public.is_banned(auth.uid()) then raise exception 'Аккаунт заблокирован модерацией'; end if;
  if (select count(*) from ai_tokens where user_id = auth.uid()) >= 5 then
    raise exception 'Не больше 5 подключений. Отзови старое';
  end if;
  t := 'rlc_' || encode(gen_random_bytes(24), 'hex');
  insert into ai_tokens (user_id, name, token_hash, prefix)
  values (auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Нейронка'), 40), encode(digest(t, 'sha256'), 'hex'), left(t, 10));
  return t;
end $$;
revoke execute on function public.create_ai_token(text) from public, anon;
grant execute on function public.create_ai_token(text) to authenticated;

-- Для серверной функции ai: по отпечатку ключа узнаём владельца. Забаненным — отказ
create or replace function public.ai_token_user(p_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  update ai_tokens set last_used_at = now() where token_hash = p_hash returning user_id into u;
  if u is null or public.is_banned(u) then return null; end if;
  return u;
end $$;
revoke execute on function public.ai_token_user(text) from public, anon, authenticated;
grant execute on function public.ai_token_user(text) to service_role;

-- Клиенты, которых добавила нейронка, сразу появляются в открытой таблице
do $$ begin alter publication supabase_realtime add table public.clients; exception when duplicate_object then null; end $$;
