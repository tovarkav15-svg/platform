-- Отметка «прочитал» ставится по серверным часам, а не по часам телефона
create or replace function public.mark_chat_read(p_chat uuid) returns timestamptz
language sql security definer set search_path = public as $$
  update chat_members set last_read_at = greatest(last_read_at, now())
  where chat_id = p_chat and user_id = auth.uid()
  returning last_read_at;
$$;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;
