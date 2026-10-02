-- Защита от спама к запуску: лимиты в сутки на заказы, отклики и бейджи
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int; who uuid;
begin
  if public.is_moderator() then return new; end if;
  if tg_table_name = 'orders' then
    lim := 10; select count(*) into n from orders where client_id = auth.uid() and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'order_responses' then
    lim := 40; select count(*) into n from order_responses where freelancer_id = auth.uid() and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'jobs' then
    lim := 5; select count(*) into n from jobs where user_id = auth.uid() and created_at > now() - interval '24 hours';
  elsif tg_table_name = 'reports' then
    lim := 20; select count(*) into n from reports where reporter = auth.uid() and created_at > now() - interval '24 hours';
  else
    return new;
  end if;
  if n >= lim then raise exception 'Слишком часто: не больше % в сутки. Попробуй завтра', lim; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders', 'order_responses', 'jobs', 'reports'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_rate_limit', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.rate_limit()', t || '_rate_limit', t);
  end loop;
end $$;
