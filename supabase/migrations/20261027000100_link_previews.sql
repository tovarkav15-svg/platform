-- Кэш карточек ссылок для чатов: заполняет серверная функция link-preview, напрямую никто не читает и не пишет
create table if not exists public.link_previews (
  url        text primary key check (char_length(url) <= 2000),
  data       jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.link_previews enable row level security;
-- Политик нет намеренно: доступ только у серверной функции (service_role)
