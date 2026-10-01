-- Новый участник чата ещё ничего не прочитал: первое сообщение должно считаться непрочитанным
alter table public.chat_members alter column last_read_at set default '1970-01-01T00:00:00Z';
