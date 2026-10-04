-- Сделки на Бирже: после выбора исполнителя стороны согласуют условия и этапы,
-- исполнитель сдаёт работу, заказчик принимает — и оба оставляют проверенный отзыв

create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  client_id    uuid not null references public.profiles(id) on delete cascade,
  executor_id  uuid not null references public.profiles(id) on delete cascade,
  price        int not null default 0 check (price between 0 and 100000000),
  deadline     date,
  terms        text not null default '' check (char_length(terms) <= 3000),
  status       text not null default 'terms' check (status in ('terms', 'active', 'review', 'done', 'cancelled')),
  client_ok    boolean not null default false,
  executor_ok  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists deals_client on public.deals(client_id, updated_at desc);
create index if not exists deals_executor on public.deals(executor_id, updated_at desc);

create table if not exists public.deal_steps (
  id       uuid primary key default gen_random_uuid(),
  deal_id  uuid not null references public.deals(id) on delete cascade,
  position int not null default 0,
  title    text not null check (char_length(trim(title)) between 1 and 160),
  amount   int not null default 0 check (amount between 0 and 100000000),
  done     boolean not null default false
);
create index if not exists deal_steps_deal on public.deal_steps(deal_id, position);

create table if not exists public.deal_events (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.deals(id) on delete cascade,
  actor      uuid references public.profiles(id) on delete set null,
  kind       text not null,
  note       text not null default '' check (char_length(note) <= 1500),
  created_at timestamptz not null default now()
);
create index if not exists deal_events_deal on public.deal_events(deal_id, created_at);

alter table public.reviews add column if not exists deal_id uuid references public.deals(id) on delete set null;

alter table public.deals enable row level security;
alter table public.deal_steps enable row level security;
alter table public.deal_events enable row level security;

create or replace function public.is_deal_member(p_deal uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from deals where id = p_deal and auth.uid() in (client_id, executor_id));
$$;
revoke execute on function public.is_deal_member(uuid) from public;
grant execute on function public.is_deal_member(uuid) to authenticated;

-- Читают только участники и модераторы; всё меняется только через функции ниже
drop policy if exists "deals: участники" on public.deals;
create policy "deals: участники" on public.deals for select using (auth.uid() in (client_id, executor_id) or public.is_moderator());
drop policy if exists "deal_steps: участники" on public.deal_steps;
create policy "deal_steps: участники" on public.deal_steps for select using (public.is_deal_member(deal_id) or public.is_moderator());
drop policy if exists "deal_events: участники" on public.deal_events;
create policy "deal_events: участники" on public.deal_events for select using (public.is_deal_member(deal_id) or public.is_moderator());

-- Сообщение в личный чат сторон, чтобы второй участник получил уведомление
create or replace function public.deal_ping(d deals, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; k text := least(d.client_id::text, d.executor_id::text) || ':' || greatest(d.client_id::text, d.executor_id::text);
begin
  select id into cid from chats where dm_key = k;
  if cid is null then
    insert into chats (dm_key) values (k) returning id into cid;
    insert into chat_members (chat_id, user_id) values (cid, d.client_id), (cid, d.executor_id) on conflict do nothing;
  end if;
  insert into messages (chat_id, sender_id, text) values (cid, auth.uid(), p_text);
end $$;
revoke execute on function public.deal_ping(deals, text) from public, authenticated;

create or replace function public.deal_get(p_deal uuid, p_need text default null) returns deals
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  select * into d from deals where id = p_deal for update;
  if not found or auth.uid() not in (d.client_id, d.executor_id) then raise exception 'Сделка не найдена'; end if;
  if public.is_banned() then raise exception 'Аккаунт заблокирован модерацией'; end if;
  if p_need is not null and d.status <> p_need then raise exception 'Сейчас это действие недоступно'; end if;
  return d;
end $$;
revoke execute on function public.deal_get(uuid, text) from public, authenticated;

-- Выбор исполнителя теперь открывает сделку (чат по-прежнему создаётся)
create or replace function public.accept_response(p_response uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r order_responses; o orders; cid uuid; did uuid;
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
  delete from deals where order_id = o.id and status = 'cancelled';
  insert into deals (order_id, client_id, executor_id, price, deadline, terms)
  values (o.id, o.client_id, r.freelancer_id,
    coalesce(nullif(r.price, 0), nullif(o.budget_to, 0), o.budget_from, 0),
    case when r.days > 0 then current_date + r.days else o.deadline end,
    left(o.description, 3000))
  returning id into did;
  insert into deal_events (deal_id, actor, kind) values (did, auth.uid(), 'created');
  cid := (select id from chats where dm_key = least(auth.uid()::text, r.freelancer_id::text) || ':' || greatest(auth.uid()::text, r.freelancer_id::text));
  if cid is null then
    insert into chats (dm_key) values (least(auth.uid()::text, r.freelancer_id::text) || ':' || greatest(auth.uid()::text, r.freelancer_id::text)) returning id into cid;
    insert into chat_members (chat_id, user_id) values (cid, auth.uid()), (cid, r.freelancer_id) on conflict do nothing;
  end if;
  insert into messages (chat_id, sender_id, text) values (cid, auth.uid(), '🤝 Выбираю тебя исполнителем заказа «' || o.title || '». Сделка открыта: давай согласуем условия и этапы — Биржа → Сделки.');
  return cid;
end $$;

-- Предложить условия: цена, срок, описание и этапы. Любая правка сбрасывает согласие второй стороны
create or replace function public.deal_propose(p_deal uuid, p_price int, p_deadline date, p_terms text, p_steps jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d deals; s jsonb; i int := 0; is_client boolean;
begin
  d := public.deal_get(p_deal, 'terms');
  is_client := auth.uid() = d.client_id;
  if jsonb_typeof(coalesce(p_steps, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_steps, '[]'::jsonb)) > 20 then raise exception 'Не больше 20 этапов'; end if;
  update deals set price = greatest(0, least(coalesce(p_price, 0), 100000000)), deadline = p_deadline, terms = left(coalesce(p_terms, ''), 3000),
    client_ok = is_client, executor_ok = not is_client, updated_at = now() where id = d.id;
  delete from deal_steps where deal_id = d.id;
  for s in select * from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) loop
    if char_length(trim(coalesce(s->>'title', ''))) > 0 then
      insert into deal_steps (deal_id, position, title, amount) values (d.id, i, left(trim(s->>'title'), 160), greatest(0, least(coalesce((s->>'amount')::int, 0), 100000000)));
      i := i + 1;
    end if;
  end loop;
  insert into deal_events (deal_id, actor, kind) values (d.id, auth.uid(), 'proposed');
  perform public.deal_ping(d, '📝 Предлагаю условия сделки — посмотри и подтверди, если всё ок.');
end $$;

-- Согласиться с условиями; когда согласны оба — работа начинается
create or replace function public.deal_agree(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  d := public.deal_get(p_deal, 'terms');
  if auth.uid() = d.client_id then update deals set client_ok = true, updated_at = now() where id = d.id returning * into d;
  else update deals set executor_ok = true, updated_at = now() where id = d.id returning * into d; end if;
  insert into deal_events (deal_id, actor, kind) values (d.id, auth.uid(), 'agreed');
  if d.client_ok and d.executor_ok then
    update deals set status = 'active', updated_at = now() where id = d.id;
    insert into deal_events (deal_id, actor, kind) values (d.id, null, 'started');
    perform public.deal_ping(d, '✅ Условия согласованы — работа началась!');
  else
    perform public.deal_ping(d, '👍 Я согласен с условиями сделки. Ждём твоего подтверждения.');
  end if;
end $$;

-- Исполнитель отмечает этапы
create or replace function public.deal_step_done(p_step uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare d deals; st deal_steps;
begin
  select * into st from deal_steps where id = p_step;
  if not found then raise exception 'Этап не найден'; end if;
  d := public.deal_get(st.deal_id, 'active');
  if auth.uid() <> d.executor_id then raise exception 'Этапы отмечает исполнитель'; end if;
  update deal_steps set done = p_done where id = p_step;
  insert into deal_events (deal_id, actor, kind, note) values (d.id, auth.uid(), case when p_done then 'step_done' else 'step_undone' end, st.title);
  update deals set updated_at = now() where id = d.id;
end $$;

-- Исполнитель сдаёт работу
create or replace function public.deal_deliver(p_deal uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  d := public.deal_get(p_deal, 'active');
  if auth.uid() <> d.executor_id then raise exception 'Сдаёт работу исполнитель'; end if;
  update deal_steps set done = true where deal_id = d.id;
  update deals set status = 'review', updated_at = now() where id = d.id;
  insert into deal_events (deal_id, actor, kind, note) values (d.id, auth.uid(), 'delivered', left(coalesce(p_note, ''), 1500));
  perform public.deal_ping(d, '📦 Сдаю работу по сделке. Проверь и прими, или верни на доработку.');
end $$;

-- Заказчик возвращает на доработку
create or replace function public.deal_revise(p_deal uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  d := public.deal_get(p_deal, 'review');
  if auth.uid() <> d.client_id then raise exception 'Только заказчик'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Напиши, что поправить'; end if;
  update deals set status = 'active', updated_at = now() where id = d.id;
  insert into deal_events (deal_id, actor, kind, note) values (d.id, auth.uid(), 'revise', left(p_note, 1500));
  perform public.deal_ping(d, '🔁 Вернул работу на доработку: ' || left(p_note, 300));
end $$;

-- Заказчик принимает работу: сделка закрыта, заказ закрыт
create or replace function public.deal_accept(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  d := public.deal_get(p_deal, 'review');
  if auth.uid() <> d.client_id then raise exception 'Принимает работу заказчик'; end if;
  update deals set status = 'done', done_at = now(), updated_at = now() where id = d.id;
  perform set_config('app.moderating', 'on', true);
  update orders set status = 'closed', updated_at = now() where id = d.order_id;
  insert into deal_events (deal_id, actor, kind) values (d.id, auth.uid(), 'done');
  perform public.deal_ping(d, '🎉 Работа принята, сделка закрыта. Спасибо! Оставим друг другу отзывы?');
end $$;

-- Отмена до сдачи: заказ снова открыт для откликов
create or replace function public.deal_cancel(p_deal uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  d := public.deal_get(p_deal);
  if d.status not in ('terms', 'active') then raise exception 'Эту сделку уже нельзя отменить'; end if;
  update deals set status = 'cancelled', updated_at = now() where id = d.id;
  perform set_config('app.moderating', 'on', true);
  update orders set status = 'open', executor_id = null, updated_at = now() where id = d.order_id;
  update order_responses set status = 'declined' where order_id = d.order_id and freelancer_id = d.executor_id;
  -- остальные отклики снова в игре: заказчик может выбрать другого
  update order_responses set status = 'sent' where order_id = d.order_id and freelancer_id <> d.executor_id and status = 'declined';
  insert into deal_events (deal_id, actor, kind, note) values (d.id, auth.uid(), 'cancelled', left(coalesce(p_note, ''), 1500));
  perform public.deal_ping(d, '✖ Отменяю сделку' || case when coalesce(trim(p_note), '') <> '' then ': ' || left(p_note, 300) else '.' end);
end $$;

-- Отзыв по закрытой сделке — с пометкой «проверено сделкой»
create or replace function public.deal_review(p_deal uuid, p_rating int, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals; target uuid;
begin
  d := public.deal_get(p_deal, 'done');
  if p_rating not between 1 and 5 then raise exception 'Оценка от 1 до 5'; end if;
  target := case when auth.uid() = d.client_id then d.executor_id else d.client_id end;
  insert into reviews (author_id, target_id, rating, text, deal_id) values (auth.uid(), target, p_rating, left(coalesce(p_text, ''), 800), d.id)
  on conflict (author_id, target_id) do update set rating = excluded.rating, text = excluded.text, deal_id = excluded.deal_id, updated_at = now();
end $$;

-- Сколько сделок человек закрыл исполнителем — для бейджей и профиля
create or replace function public.deals_done_of(p_users uuid[]) returns table (user_id uuid, n int)
language sql security definer set search_path = public stable as $$
  select executor_id, count(*)::int from deals where status = 'done' and executor_id = any(p_users) group by executor_id;
$$;

revoke execute on function public.deal_propose(uuid, int, date, text, jsonb), public.deal_agree(uuid), public.deal_step_done(uuid, boolean),
  public.deal_deliver(uuid, text), public.deal_revise(uuid, text), public.deal_accept(uuid), public.deal_cancel(uuid, text),
  public.deal_review(uuid, int, text), public.deals_done_of(uuid[]) from public;
grant execute on function public.deal_propose(uuid, int, date, text, jsonb), public.deal_agree(uuid), public.deal_step_done(uuid, boolean),
  public.deal_deliver(uuid, text), public.deal_revise(uuid, text), public.deal_accept(uuid), public.deal_cancel(uuid, text),
  public.deal_review(uuid, int, text) to authenticated;
grant execute on function public.deals_done_of(uuid[]) to anon, authenticated;

-- Заказы, которые уже «в работе», получают сделку на этапе согласования
insert into deals (order_id, client_id, executor_id, price, deadline, terms)
select o.id, o.client_id, o.executor_id,
  coalesce((select nullif(r.price, 0) from order_responses r where r.order_id = o.id and r.freelancer_id = o.executor_id), nullif(o.budget_to, 0), o.budget_from, 0),
  o.deadline, left(o.description, 3000)
from orders o where o.status = 'in_work' and o.executor_id is not null
on conflict (order_id) do nothing;

do $$ begin alter publication supabase_realtime add table public.deals; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.deal_steps; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.deal_events; exception when duplicate_object then null; end $$;
