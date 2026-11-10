-- Relic в Telegram: привязка аккаунта к Telegram (вход в одно касание) и уведомления от бота @relicprodbot.
-- Привязку создаёт и меняет только серверная функция tg-auth после проверки подписи Telegram.

create table if not exists public.tg_links (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  tg_id       bigint not null unique,
  tg_username text not null default '',
  can_write   boolean not null default true,  -- бот может писать человеку
  notify      boolean not null default true,  -- человек хочет уведомления в Telegram
  created_at  timestamptz not null default now()
);
alter table public.tg_links enable row level security;
drop policy if exists tg_links_select on public.tg_links;
create policy tg_links_select on public.tg_links for select to authenticated using (user_id = auth.uid());

-- Включить или выключить уведомления в Telegram
create or replace function public.tg_set_notify(p_on boolean) returns void
language sql security definer set search_path = public as $$
  update tg_links set notify = p_on where user_id = auth.uid();
$$;
revoke all on function public.tg_set_notify(boolean) from public, anon;
grant execute on function public.tg_set_notify(boolean) to authenticated;

-- Отвязать Telegram от аккаунта
-- Аккаунт, созданный через Telegram, без пароля отвязать нельзя — иначе в него больше не войти
create or replace function public.tg_unlink() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from auth.users where id = auth.uid() and email like '%@telegram.relic' and coalesce(raw_user_meta_data->>'pw_set', '') <> 'true') then
    raise exception 'Сначала задай пароль — иначе без Telegram в аккаунт не войти';
  end if;
  delete from tg_links where user_id = auth.uid();
end $$;
revoke all on function public.tg_unlink() from public, anon;
grant execute on function public.tg_unlink() to authenticated;

-- Новый отклик на заказ — зовём ту же функцию уведомлений (она сама перечитает отклик)
create or replace function public.push_on_response() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  begin
    perform net.http_post(
      url := 'https://wrmohfypaprsurkgfcii.supabase.co/functions/v1/push',
      body := jsonb_build_object('response_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null; -- уведомление не должно мешать отклику
  end;
  return new;
end $$;
revoke all on function public.push_on_response() from public, anon, authenticated;

drop trigger if exists order_responses_push on public.order_responses;
create trigger order_responses_push after insert on public.order_responses for each row execute function public.push_on_response();

-- Отметка «отклик уже разослан»
create table if not exists public.push_sent_responses (
  response_id uuid primary key,
  sent_at timestamptz not null default now()
);
alter table public.push_sent_responses enable row level security;
