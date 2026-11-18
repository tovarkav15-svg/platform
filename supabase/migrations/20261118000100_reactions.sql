-- Реакции на сообщения: эмодзи под сообщением, как в Telegram и iMessage. Ставить и видеть могут только участники чата
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  chat_id    uuid not null references public.chats(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists message_reactions_chat on public.message_reactions(chat_id);

alter table public.message_reactions enable row level security;
drop policy if exists "реакции: видят участники" on public.message_reactions;
create policy "реакции: видят участники" on public.message_reactions for select to authenticated using (public.is_chat_member(chat_id));
drop policy if exists "реакции: ставлю свои" on public.message_reactions;
create policy "реакции: ставлю свои" on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and public.is_chat_member(chat_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.chat_id = message_reactions.chat_id and m.deleted_at is null));
drop policy if exists "реакции: снимаю свои" on public.message_reactions;
create policy "реакции: снимаю свои" on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- Не больше трёх разных реакций от одного человека на сообщение
create or replace function public.reaction_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from message_reactions where message_id = new.message_id and user_id = new.user_id) >= 3 then
    raise exception 'too many reactions';
  end if;
  return new;
end $$;
revoke all on function public.reaction_limit() from public, anon, authenticated;
drop trigger if exists message_reactions_limit on public.message_reactions;
create trigger message_reactions_limit before insert on public.message_reactions for each row execute function public.reaction_limit();

alter table public.message_reactions replica identity full;
do $$ begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end $$;
