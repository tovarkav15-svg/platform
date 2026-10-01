-- Owner, персонализация профиля, Proof of Work, проекты, цели и задачи, медиа в чатах

-- ============ Персонализация профиля ============
alter table public.profiles
  add column if not exists headline     text not null default '' check (char_length(headline) <= 60),
  add column if not exists status       text not null default '' check (char_length(status) <= 80),
  add column if not exists city         text not null default '' check (char_length(city) <= 40),
  add column if not exists skills       text not null default '' check (char_length(skills) <= 300),
  add column if not exists open_to_work boolean not null default false,
  add column if not exists sections     text not null default 'work,projects,goals' check (char_length(sections) <= 60),
  add column if not exists pinned_project uuid;

-- ============ Proof of Work ============
create table if not exists public.works (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title       text not null check (char_length(trim(title)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 600),
  result      text not null default '' check (char_length(result) <= 120),
  niche       text not null default '',
  link        text not null default '' check (link = '' or link ~ '^https?://'),
  image_path  text,
  created_at  timestamptz not null default now()
);
create index if not exists works_user on public.works(user_id, created_at desc);
create index if not exists works_time on public.works(created_at desc);

-- ============ Проекты ============
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name        text not null check (char_length(trim(name)) between 2 and 60),
  tagline     text not null default '' check (char_length(tagline) <= 120),
  description text not null default '' check (char_length(description) <= 1000),
  stage       text not null default 'idea' check (stage in ('idea', 'building', 'launched', 'scaling')),
  niche       text not null default '',
  link        text not null default '' check (link = '' or link ~ '^https?://'),
  looking_for text not null default '' check (char_length(looking_for) <= 200),
  image_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_user on public.projects(user_id, created_at desc);
create index if not exists projects_time on public.projects(updated_at desc);

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default '' check (char_length(role) <= 40),
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.profiles drop constraint if exists profiles_pinned_project_fkey;
alter table public.profiles add constraint profiles_pinned_project_fkey
  foreign key (pinned_project) references public.projects(id) on delete set null;

-- ============ Цели и задачи ============
create table if not exists public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title      text not null check (char_length(trim(title)) between 2 and 100),
  due_date   date,
  is_public  boolean not null default false,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  goal_id    uuid references public.goals(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 160),
  due_date   date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists goals_user on public.goals(user_id);
create index if not exists tasks_user on public.tasks(user_id, done, due_date);

-- ============ Правила доступа ============
alter table public.works enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.goals enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "works: все читают" on public.works;
create policy "works: все читают" on public.works for select using (true);
drop policy if exists "works: свои" on public.works;
create policy "works: свои" on public.works for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "projects: все читают" on public.projects;
create policy "projects: все читают" on public.projects for select using (true);
drop policy if exists "projects: свои" on public.projects;
create policy "projects: свои" on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.owns_project(p uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from projects where id = p and user_id = auth.uid());
$$;
revoke execute on function public.owns_project(uuid) from public, anon;
grant execute on function public.owns_project(uuid) to authenticated;

drop policy if exists "members: все читают" on public.project_members;
create policy "members: все читают" on public.project_members for select using (true);
drop policy if exists "members: автор проекта управляет" on public.project_members;
create policy "members: автор проекта управляет" on public.project_members for all to authenticated
  using (public.owns_project(project_id)) with check (public.owns_project(project_id));
drop policy if exists "members: могу выйти" on public.project_members;
create policy "members: могу выйти" on public.project_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists "goals: свои или открытые" on public.goals;
create policy "goals: свои или открытые" on public.goals for select using (user_id = auth.uid() or is_public);
drop policy if exists "goals: свои" on public.goals;
create policy "goals: свои" on public.goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tasks: свои или открытой цели" on public.tasks;
create policy "tasks: свои или открытой цели" on public.tasks for select
  using (user_id = auth.uid() or exists (select 1 from goals g where g.id = goal_id and g.is_public));
drop policy if exists "tasks: свои" on public.tasks;
create policy "tasks: свои" on public.tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Медиа в сообщениях ============
alter table public.messages
  add column if not exists kind text not null default 'text' check (kind in ('text', 'image', 'video', 'voice', 'file')),
  add column if not exists media_path text,
  add column if not exists media_meta jsonb not null default '{}'::jsonb;
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (char_length(text) <= 2000 and (kind <> 'text' or char_length(trim(text)) >= 1));
alter table public.messages alter column text set default '';
alter table public.messages drop constraint if exists messages_media_check;
alter table public.messages add constraint messages_media_check
  check (kind = 'text' or (media_path is not null and split_part(media_path, '/', 1) = chat_id::text));

drop function if exists public.list_chats();
create or replace function public.list_chats() returns table (
  chat_id uuid, other_id uuid, other_username text, other_name text, other_avatar text, other_accent text,
  last_text text, last_kind text, last_mine boolean, last_at timestamptz, unread int, updated_at timestamptz
)
language sql security definer set search_path = public stable as $$
  select c.id, p.id, p.username, p.display_name, p.avatar, p.accent,
         lm.text, lm.kind, lm.sender_id = auth.uid(), lm.created_at,
         (select count(*)::int from messages m where m.chat_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at),
         c.updated_at
  from chat_members me
  join chats c on c.id = me.chat_id
  join chat_members om on om.chat_id = c.id and om.user_id <> me.user_id
  join profiles p on p.id = om.user_id
  left join lateral (select text, kind, sender_id, created_at from messages m where m.chat_id = c.id order by created_at desc limit 1) lm on true
  where me.user_id = auth.uid()
  order by c.updated_at desc;
$$;
revoke execute on function public.list_chats() from public, anon;
grant execute on function public.list_chats() to authenticated;

-- ============ Хранилище файлов ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-media', 'chat-media', false, 52428800,
    array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm',
          'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a','application/pdf','application/zip',
          'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']),
  ('public-media', 'public-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Файлы чата: путь chat_id/файл, доступ только участникам чата
drop policy if exists "chat-media: участники читают" on storage.objects;
create policy "chat-media: участники читают" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_chat_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "chat-media: участники загружают" on storage.objects;
create policy "chat-media: участники загружают" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and public.is_chat_member(((storage.foldername(name))[1])::uuid));

-- Картинки работ и проектов: путь user_id/файл, читают все, пишет владелец
drop policy if exists "public-media: свои загружаю" on storage.objects;
create policy "public-media: свои загружаю" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "public-media: свои удаляю" on storage.objects;
create policy "public-media: свои удаляю" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and (storage.foldername(name))[1] = auth.uid()::text);
