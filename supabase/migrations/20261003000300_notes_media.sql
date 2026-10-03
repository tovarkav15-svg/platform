-- Заметки с форматированием и медиа: тело в HTML (больше места), файлы в закрытом хранилище автора
alter table public.notes drop constraint if exists notes_body_check;
alter table public.notes add constraint notes_body_check check (char_length(body) <= 300000);

insert into storage.buckets (id, name, public, file_size_limit)
values ('notes-media', 'notes-media', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "notes-media: свои читаю" on storage.objects;
create policy "notes-media: свои читаю" on storage.objects for select to authenticated
  using (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "notes-media: свои загружаю" on storage.objects;
create policy "notes-media: свои загружаю" on storage.objects for insert to authenticated
  with check (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned());
drop policy if exists "notes-media: свои удаляю" on storage.objects;
create policy "notes-media: свои удаляю" on storage.objects for delete to authenticated
  using (bucket_id = 'notes-media' and (storage.foldername(name))[1] = auth.uid()::text);
