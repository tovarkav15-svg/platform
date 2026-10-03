-- Обращения в поддержку: команда видит их только после первого сообщения человека
create or replace function public.list_chats() returns table (
  chat_id uuid, kind text, title text, avatar text, accent text, emoji text, is_public boolean, support_for uuid,
  other_id uuid, other_username text, other_name text, other_avatar text, other_accent text,
  member_count int, my_role text, last_text text, last_kind text, last_mine boolean, last_sender text, last_at timestamptz, unread int, updated_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select c.id, c.kind,
         case when c.kind = 'support' and c.support_for <> auth.uid() then 'Поддержка · @' || sp.username else c.title end,
         c.avatar, c.accent, c.emoji, c.is_public, c.support_for,
         op.id, op.username, op.display_name, op.avatar, op.accent,
         (select count(*)::int from chat_members x where x.chat_id = c.id),
         me.role,
         lm.text, lm.kind, lm.sender_id = auth.uid(), ls.display_name, lm.created_at,
         (select count(*)::int from messages m where m.chat_id = c.id and m.sender_id <> auth.uid() and m.kind <> 'system' and m.created_at > me.last_read_at),
         c.updated_at
  from chat_members me
  join chats c on c.id = me.chat_id
  left join lateral (select p.* from chat_members o join profiles p on p.id = o.user_id
                     where c.kind = 'dm' and o.chat_id = c.id and o.user_id <> me.user_id limit 1) op on true
  left join profiles sp on sp.id = c.support_for
  left join lateral (select text, kind, sender_id, created_at from messages m where m.chat_id = c.id order by created_at desc limit 1) lm on true
  left join profiles ls on ls.id = lm.sender_id
  where me.user_id = auth.uid()
    -- обращение попадает к команде, только когда человек уже что-то написал
    and not (c.kind = 'support' and c.support_for <> auth.uid()
             and not exists (select 1 from messages m where m.chat_id = c.id and m.kind <> 'system' and m.sender_id = c.support_for))
  order by (c.kind = 'support' and c.support_for = auth.uid()) desc, c.updated_at desc;
$$;
