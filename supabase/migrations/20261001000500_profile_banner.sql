-- Персонализация: баннер профиля и подробное описание
alter table public.profiles
  add column if not exists banner_path   text check (banner_path is null or (char_length(banner_path) <= 200 and split_part(banner_path, '/', 1) = id::text)),
  add column if not exists banner_preset text not null default 'aurora' check (char_length(banner_preset) <= 20),
  add column if not exists about         text not null default '' check (char_length(about) <= 1500);
