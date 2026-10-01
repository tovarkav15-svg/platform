-- Участники чата: плюс флаг команды поддержки
drop function if exists public.chat_people(uuid);
create function public.chat_people(p_chat uuid) returns table (user_id uuid, role text, username text, display_name text, avatar text, accent text, user_role text, is_support boolean)
language sql security definer set search_path = public stable as $$
  select m.user_id, m.role, p.username, p.display_name, p.avatar, p.accent, p.role, p.is_support
  from chat_members m join profiles p on p.id = m.user_id
  where m.chat_id = p_chat and public.is_chat_member(p_chat)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.display_name;
$$;
revoke execute on function public.chat_people(uuid) from public, anon;
grant execute on function public.chat_people(uuid) to authenticated;
