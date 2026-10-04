-- Аккаунты переезжают со служебных адресов u…@users.platforma.app на настоящую почту,
-- чтобы письма (сброс пароля и т.п.) приходили людям. Старые адреса сохраняем для отката.
create table if not exists public.auth_email_backup (
  id        uuid primary key,
  old_email text not null,
  new_email text not null,
  moved_at  timestamptz not null default now()
);
alter table public.auth_email_backup enable row level security; -- без политик: читать может только владелец базы

with todo as (
  select u.id, u.email as old_email, lower(trim(pi.email)) as new_email
  from auth.users u join public.private_info pi on pi.id = u.id
  where u.email like '%@users.platforma.app'
    and lower(trim(pi.email)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and not exists (select 1 from auth.users x where lower(x.email) = lower(trim(pi.email)) and x.id <> u.id)
)
insert into public.auth_email_backup (id, old_email, new_email)
select id, old_email, new_email from todo
on conflict (id) do nothing;

update auth.users u set email = b.new_email, updated_at = now()
from public.auth_email_backup b
where b.id = u.id and u.email = b.old_email;

update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(b.new_email)), updated_at = now()
from public.auth_email_backup b
where i.user_id = b.id and i.provider = 'email';
