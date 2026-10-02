-- Бейджи и заказы видны сразу; модераторы проверяют после и могут отклонить (тогда скрываются)
drop policy if exists "jobs: все читают одобренные" on public.jobs;
create policy "jobs: видны сразу, кроме отклонённых" on public.jobs for select using ((active and mod_status <> 'rejected') or user_id = auth.uid() or public.is_moderator());

drop policy if exists "orders: видят одобренные" on public.orders;
create policy "orders: видны сразу, кроме отклонённых" on public.orders for select using (mod_status <> 'rejected' or client_id = auth.uid() or public.is_moderator());

drop policy if exists "responses: откликаюсь" on public.order_responses;
create policy "responses: откликаюсь" on public.order_responses for insert to authenticated with check (
  freelancer_id = auth.uid() and status = 'sent'
  and exists (select 1 from orders o where o.id = order_id and o.status = 'open' and o.mod_status <> 'rejected' and o.client_id <> auth.uid())
);

-- Разбан возвращает бейджи на биржу
create or replace function public.unban_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  update profiles set banned_until = null, ban_reason = '' where id = p_user;
  update jobs set active = true where user_id = p_user and mod_status <> 'rejected';
  insert into mod_log (moderator, action, target_user) values (auth.uid(), 'unban', p_user);
end $$;

-- Бейджи, которые выключились из-за бана или по ошибке, — снова на биржу
update public.jobs set active = true
where active = false and user_id in (select id from profiles where username in ('but', 'awiny')) and (select banned_until from profiles where id = user_id) is null;
