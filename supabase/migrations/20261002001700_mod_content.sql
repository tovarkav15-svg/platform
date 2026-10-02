-- Бан доходит мгновенно (Realtime по профилям) + модераторы могут удалить любой контент пользователя

do $$ begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end $$;

-- Очистить поля профиля: avatar, banner, bio, about, headline, status, looking_for, skills, links, city, name
create or replace function public.mod_clear_profile(p_user uuid, p_fields text[]) returns void
language plpgsql security definer set search_path = public as $$
declare f text;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if public.is_moderator(p_user) then raise exception 'Профиль модератора трогать нельзя'; end if;
  perform set_config('app.moderating', 'on', true);
  foreach f in array p_fields loop
    case f
      when 'avatar'      then update profiles set avatar = null where id = p_user;
      when 'banner'      then update profiles set banner_path = null where id = p_user;
      when 'bio'         then update profiles set bio = '' where id = p_user;
      when 'about'       then update profiles set about = '' where id = p_user;
      when 'headline'    then update profiles set headline = '', status = '' where id = p_user;
      when 'looking_for' then update profiles set looking_for = '' where id = p_user;
      when 'skills'      then update profiles set skills = '' where id = p_user;
      when 'links'       then update profiles set telegram = '', website = '' where id = p_user;
      when 'city'        then update profiles set city = '' where id = p_user;
      when 'name'        then update profiles set display_name = username where id = p_user;
      when 'deco'        then delete from profile_deco where user_id = p_user;
      else raise exception 'Неизвестное поле %', f;
    end case;
  end loop;
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'clear_profile', p_user, array_to_string(p_fields, ', '));
end $$;

-- Удалить одну вещь пользователя: работу, проект, бейдж, отзыв, свой канал/группу
create or replace function public.mod_delete(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  perform set_config('app.moderating', 'on', true);
  case p_kind
    when 'work'    then delete from works    where id = p_id returning user_id into v_user;
    when 'project' then delete from projects where id = p_id returning user_id into v_user;
    when 'job'     then delete from jobs     where id = p_id returning user_id into v_user;
    when 'review'  then delete from reviews  where id = p_id returning author_id into v_user;
    when 'chat'    then delete from chats    where id = p_id and kind in ('group', 'channel') returning owner_id into v_user;
    when 'message' then perform public.delete_message(p_id);
    else raise exception 'Неизвестный тип %', p_kind;
  end case;
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'delete_' || p_kind, v_user, p_id::text);
end $$;

-- Стереть всё, что создал пользователь (профиль остаётся пустым). Сообщения помечаются удалёнными
create or replace function public.mod_wipe_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Только для модераторов'; end if;
  if public.is_moderator(p_user) then raise exception 'Модератора стереть нельзя'; end if;
  perform set_config('app.moderating', 'on', true);
  delete from works where user_id = p_user;
  delete from projects where user_id = p_user;
  delete from jobs where user_id = p_user;
  delete from reviews where author_id = p_user;
  delete from chats where owner_id = p_user and kind in ('group', 'channel');
  update messages set deleted_at = now(), text = '·', kind = 'text', media_path = null, media_meta = '{}'::jsonb
    where sender_id = p_user and deleted_at is null and kind <> 'system';
  delete from profile_deco where user_id = p_user;
  update profiles set avatar = null, banner_path = null, bio = '', about = '', headline = '', status = '', looking_for = '',
    skills = '', telegram = '', website = '', city = '' where id = p_user;
  insert into mod_log (moderator, action, target_user, note) values (auth.uid(), 'wipe', p_user, 'стёрт весь контент');
end $$;

revoke execute on function public.mod_clear_profile(uuid, text[]), public.mod_delete(text, uuid), public.mod_wipe_user(uuid) from public;
grant execute on function public.mod_clear_profile(uuid, text[]), public.mod_delete(text, uuid), public.mod_wipe_user(uuid) to authenticated;
