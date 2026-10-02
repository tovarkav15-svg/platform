-- Заказы от заказчиков и отклики фрилансеров

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 3 and 100),
  niche       text not null check (char_length(niche) <= 30),
  description text not null default '' check (char_length(description) <= 3000),
  budget_from int not null default 0 check (budget_from between 0 and 100000000),
  budget_to   int not null default 0 check (budget_to between 0 and 100000000),
  deadline    date,
  status      text not null default 'open' check (status in ('open', 'in_work', 'closed')),
  executor_id uuid references public.profiles(id) on delete set null,
  mod_status  text not null default 'pending' check (mod_status in ('pending', 'approved', 'rejected')),
  mod_note    text not null default '' check (char_length(mod_note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists orders_feed on public.orders(mod_status, status, created_at desc);
create index if not exists orders_client on public.orders(client_id, created_at desc);

create table if not exists public.order_responses (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  freelancer_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message       text not null check (char_length(trim(message)) between 5 and 1500),
  price         int not null default 0 check (price between 0 and 100000000),
  days          int not null default 0 check (days between 0 and 365),
  status        text not null default 'sent' check (status in ('sent', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  unique (order_id, freelancer_id)
);
create index if not exists responses_order on public.order_responses(order_id, created_at);
create index if not exists responses_freelancer on public.order_responses(freelancer_id, created_at desc);

alter table public.orders enable row level security;
alter table public.order_responses enable row level security;

-- Заказы: одобренные видят все, свои — автор, модераторы — всё
drop policy if exists "orders: видят одобренные" on public.orders;
create policy "orders: видят одобренные" on public.orders for select using (mod_status = 'approved' or client_id = auth.uid() or public.is_moderator());
drop policy if exists "orders: создаю свои" on public.orders;
create policy "orders: создаю свои" on public.orders for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "orders: меняю свои" on public.orders;
create policy "orders: меняю свои" on public.orders for update to authenticated using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "orders: удаляю свои" on public.orders;
create policy "orders: удаляю свои" on public.orders for delete to authenticated using (client_id = auth.uid() or public.is_moderator());

-- Правка текста заказа отправляет его на повторную проверку; модерацию и исполнителя автор сам не меняет
create or replace function public.orders_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.moderating', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.mod_status := 'pending'; new.mod_note := ''; new.status := 'open'; new.executor_id := null;
  else
    new.executor_id := old.executor_id;
    if new.status = 'in_work' and old.status <> 'in_work' then new.status := old.status; end if; -- «в работе» ставит только выбор исполнителя
    if (new.title, new.niche, new.description, new.budget_from, new.budget_to, new.deadline) is distinct from (old.title, old.niche, old.description, old.budget_from, old.budget_to, old.deadline) then
      new.mod_status := 'pending'; new.mod_note := '';
    else
      new.mod_status := old.mod_status; new.mod_note := old.mod_note;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before insert or update on public.orders for each row execute function public.orders_guard();
drop trigger if exists orders_deny_banned on public.orders;
create trigger orders_deny_banned before insert or update on public.orders for each row execute function public.deny_banned();

-- Отклики: видит автор отклика и заказчик
create or replace function public.is_order_client(p_order uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from orders where id = p_order and client_id = auth.uid());
$$;
revoke execute on function public.is_order_client(uuid) from public;
grant execute on function public.is_order_client(uuid) to authenticated;

drop policy if exists "responses: свои и заказчика" on public.order_responses;
create policy "responses: свои и заказчика" on public.order_responses for select using (freelancer_id = auth.uid() or public.is_order_client(order_id) or public.is_moderator());
drop policy if exists "responses: откликаюсь" on public.order_responses;
create policy "responses: откликаюсь" on public.order_responses for insert to authenticated with check (
  freelancer_id = auth.uid() and status = 'sent'
  and exists (select 1 from orders o where o.id = order_id and o.status = 'open' and o.mod_status = 'approved' and o.client_id <> auth.uid())
);
drop policy if exists "responses: отзываю свой" on public.order_responses;
create policy "responses: отзываю свой" on public.order_responses for delete to authenticated using (freelancer_id = auth.uid() and status = 'sent');
drop trigger if exists order_responses_deny_banned on public.order_responses;
create trigger order_responses_deny_banned before insert or update on public.order_responses for each row execute function public.deny_banned();

-- Заказчик выбирает исполнителя: заказ «в работе», остальным — отказ, и сразу открывается личный чат
create or replace function public.accept_response(p_response uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r order_responses; o orders; cid uuid;
begin
  select * into r from order_responses where id = p_response;
  if not found then raise exception 'Отклик не найден'; end if;
  select * into o from orders where id = r.order_id;
  if o.client_id <> auth.uid() then raise exception 'Выбирать исполнителя может только заказчик'; end if;
  if o.status <> 'open' then raise exception 'Заказ уже не открыт'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован модерацией'; end if;
  perform set_config('app.moderating', 'on', true);
  update order_responses set status = case when id = p_response then 'accepted' else 'declined' end where order_id = o.id;
  update orders set status = 'in_work', executor_id = r.freelancer_id, updated_at = now() where id = o.id;
  -- чат с исполнителем, даже если у него «только друзья»: он сам откликнулся
  cid := (select id from chats where dm_key = least(auth.uid()::text, r.freelancer_id::text) || ':' || greatest(auth.uid()::text, r.freelancer_id::text));
  if cid is null then
    insert into chats (dm_key) values (least(auth.uid()::text, r.freelancer_id::text) || ':' || greatest(auth.uid()::text, r.freelancer_id::text)) returning id into cid;
    insert into chat_members (chat_id, user_id) values (cid, auth.uid()), (cid, r.freelancer_id) on conflict do nothing;
  end if;
  insert into messages (chat_id, sender_id, text) values (cid, auth.uid(), '🤝 Выбираю тебя исполнителем заказа «' || o.title || '». Обсудим детали?');
  return cid;
end $$;

create or replace function public.decline_response(p_response uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from order_responses r join orders o on o.id = r.order_id where r.id = p_response and o.client_id = auth.uid()) then
    raise exception 'Только заказчик';
  end if;
  update order_responses set status = 'declined' where id = p_response and status = 'sent';
end $$;

create or replace function public.moderate_order(p_order uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  update orders set mod_status = case when p_approve then 'approved' else 'rejected' end, mod_note = left(coalesce(p_note, ''), 300) where id = p_order;
  insert into mod_log (moderator, action, note) values (auth.uid(), case when p_approve then 'approve_order' else 'reject_order' end, p_order::text);
end $$;

-- Сколько откликов у заказа (видно всем, без содержимого)
create or replace function public.order_response_counts(p_orders uuid[]) returns table (order_id uuid, n int)
language sql security definer set search_path = public stable as $$
  select order_id, count(*)::int from order_responses where order_id = any(p_orders) group by order_id;
$$;

revoke execute on function public.accept_response(uuid), public.decline_response(uuid), public.moderate_order(uuid, boolean, text), public.order_response_counts(uuid[]) from public;
grant execute on function public.accept_response(uuid), public.decline_response(uuid), public.moderate_order(uuid, boolean, text) to authenticated;
grant execute on function public.order_response_counts(uuid[]) to anon, authenticated;

-- Модераторы удаляют заказы через общий инструмент
create or replace function public.mod_delete(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  case p_kind
    when 'work'    then delete from works    where id = p_id returning user_id into v_user;
    when 'project' then delete from projects where id = p_id returning user_id into v_user;
    when 'job'     then delete from jobs     where id = p_id returning user_id into v_user;
    when 'order'   then delete from orders   where id = p_id returning client_id into v_user;
    when 'review'  then delete from reviews  where id = p_id returning author_id into v_user;
    when 'chat'    then delete from chats    where id = p_id and kind in ('group', 'channel') returning owner_id into v_user;
    when 'message' then perform public.delete_message(p_id);
    else raise exception 'Неизвестный тип %', p_kind;
  end case;
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'delete_' || p_kind, v_user, p_id::text);
end $$;

do $$ begin alter publication supabase_realtime add table public.order_responses; exception when duplicate_object then null; end $$;
