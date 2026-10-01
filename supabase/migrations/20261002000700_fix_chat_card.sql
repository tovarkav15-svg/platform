-- Убираем неоднозначность имён колонок в chat_card
create or replace function public.chat_card(p_code text default null, p_username text default null)
returns table (chat_id uuid, kind text, title text, description text, avatar text, accent text, emoji text, username text,
               banner_preset text, banner text, member_count int, joined boolean, requested boolean, mode text, valid boolean)
language plpgsql security definer set search_path = public stable as $$
declare inv chat_invites; c chats;
begin
  if p_code is not null then
    select * into inv from chat_invites ci where ci.code = p_code;
    if inv is null then return; end if;
    select * into c from chats ch where ch.id = inv.chat_id;
  else
    select * into c from chats ch where ch.username = lower(p_username) and ch.kind in ('group', 'channel');
    if c is null then return; end if;
  end if;
  return query select c.id, c.kind, c.title, c.description, c.avatar, c.accent, c.emoji, c.username, c.banner_preset, c.banner,
    (select count(*)::int from chat_members m where m.chat_id = c.id),
    exists (select 1 from chat_members m where m.chat_id = c.id and m.user_id = auth.uid()),
    exists (select 1 from join_requests r where r.chat_id = c.id and r.user_id = auth.uid()),
    case when inv.code is not null then inv.mode when c.is_public or c.join_mode = 'open' then 'join' when c.join_mode = 'request' then 'request' else 'invite' end,
    case when inv.code is not null then not inv.revoked and (inv.expires_at is null or inv.expires_at > now()) and (inv.max_uses is null or inv.uses < inv.max_uses) else true end;
end $$;
