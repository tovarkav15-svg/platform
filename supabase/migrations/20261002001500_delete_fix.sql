-- Удалённое сообщение становится текстовой заглушкой (у медиа-сообщений путь к файлу обязателен)
create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = p_id;
  if not found then return; end if;
  if not (m.sender_id = auth.uid() or public.is_moderator()
          or exists (select 1 from chat_members cm join chats c on c.id = cm.chat_id where cm.chat_id = m.chat_id and cm.user_id = auth.uid() and cm.role in ('owner', 'admin') and c.kind in ('group', 'channel'))) then
    raise exception 'Нельзя удалить это сообщение';
  end if;
  update messages set deleted_at = now(), text = '·', kind = case when kind = 'system' then kind else 'text' end, media_path = null, media_meta = '{}'::jsonb where id = p_id;
end $$;
