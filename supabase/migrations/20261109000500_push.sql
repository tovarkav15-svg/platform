-- Уведомления на телефон о новых сообщениях (Web Push).
-- Подписки устройств хранятся здесь; после каждого нового сообщения база зовёт серверную функцию push,
-- она сама перечитывает сообщение и рассылает уведомления участникам чата.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;

drop policy if exists push_subs_select on public.push_subs;
create policy push_subs_select on public.push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subs_insert on public.push_subs;
create policy push_subs_insert on public.push_subs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_subs_update on public.push_subs;
create policy push_subs_update on public.push_subs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists push_subs_delete on public.push_subs;
create policy push_subs_delete on public.push_subs for delete to authenticated using (user_id = auth.uid());

-- Отметка «уже разослано»: каждое сообщение уходит в уведомления один раз, даже если функцию позвали повторно
create table if not exists public.push_sent (
  message_id uuid primary key,
  sent_at timestamptz not null default now()
);
alter table public.push_sent enable row level security; -- правил нет: читать и писать может только сервер

create or replace function public.push_on_message() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.kind = 'system' then return new; end if;
  begin
    perform net.http_post(
      url := 'https://wrmohfypaprsurkgfcii.supabase.co/functions/v1/push',
      body := jsonb_build_object('message_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null; -- уведомление не должно мешать отправке сообщения
  end;
  return new;
end $$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages for each row execute function public.push_on_message();

-- Сохранить подписку этого устройства за собой. Если на устройстве раньше был другой аккаунт,
-- подписка переходит к тому, кто вошёл сейчас — уведомления чужого аккаунта сюда больше не придут.
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text, p_ua text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if length(p_endpoint) > 1000 or p_endpoint !~ '^https://' then raise exception 'bad endpoint'; end if;
  insert into push_subs (user_id, endpoint, p256dh, auth, ua)
  values (auth.uid(), p_endpoint, left(p_p256dh, 200), left(p_auth, 100), left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, created_at = now();
end $$;
revoke all on function public.save_push_sub(text, text, text, text) from public, anon;
grant execute on function public.save_push_sub(text, text, text, text) to authenticated;
