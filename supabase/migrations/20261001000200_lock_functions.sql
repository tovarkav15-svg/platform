-- Закрываем лишний доступ к функциям (по совету проверки безопасности Supabase)
alter function public.protect_role() set search_path = public;

-- Служебные функции триггеров нельзя вызывать через API
revoke execute on function public.handle_new_user(), public.bump_chat(), public.protect_role() from public, anon, authenticated;

-- Только для вошедших
revoke execute on function
  public.send_friend_request(uuid), public.accept_friend_request(uuid), public.remove_friend(uuid),
  public.get_or_create_dm(uuid), public.list_chats(), public.is_chat_member(uuid)
from public, anon;
grant execute on function
  public.send_friend_request(uuid), public.accept_friend_request(uuid), public.remove_friend(uuid),
  public.get_or_create_dm(uuid), public.list_chats(), public.is_chat_member(uuid)
to authenticated;

-- Нужны и гостям: вход по юзернейму и число друзей в публичном профиле
revoke execute on function public.login_email(text), public.friend_count(uuid) from public;
grant execute on function public.login_email(text), public.friend_count(uuid) to anon, authenticated;
