-- Без роли в чате (посторонний) — значит «нельзя», а не «неизвестно»
create or replace function public.chat_role(p_chat uuid) returns text
language sql security definer set search_path = public stable as $$
  select coalesce((select role from chat_members where chat_id = p_chat and user_id = auth.uid()), 'none');
$$;
