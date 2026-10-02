-- Видео-баннеры, сцена «Винланд», отзывы, учёт времени и счета для фрилансеров

-- ============ Видео в публичных медиа (баннер профиля) ============
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
where id = 'public-media';

insert into public.shop_items (id, kind, name, price, min_tier, sort) values
  ('s-vinland', 'scene', 'Винланд', 1000, 2, 6)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, min_tier = excluded.min_tier, sort = excluded.sort;

-- ============ Отзывы ============
-- Оставить можно тому, с кем была личная переписка (значит, реально общались). Один отзыв на человека, себе нельзя
create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  text       text not null default '' check (char_length(text) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, target_id),
  check (author_id <> target_id)
);
create index if not exists reviews_target on public.reviews(target_id, created_at desc);
alter table public.reviews enable row level security;

create or replace function public.can_review(p_target uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and auth.uid() <> p_target and exists (
    select 1 from chats c
    where c.dm_key = least(auth.uid()::text, p_target::text) || ':' || greatest(auth.uid()::text, p_target::text)
      and exists (select 1 from messages m where m.chat_id = c.id)
  );
$$;
revoke execute on function public.can_review(uuid) from public;
grant execute on function public.can_review(uuid) to authenticated;

drop policy if exists "reviews: все читают" on public.reviews;
create policy "reviews: все читают" on public.reviews for select using (true);
drop policy if exists "reviews: пишу, если общались" on public.reviews;
create policy "reviews: пишу, если общались" on public.reviews for insert to authenticated with check (author_id = auth.uid() and public.can_review(target_id));
drop policy if exists "reviews: правлю свой" on public.reviews;
create policy "reviews: правлю свой" on public.reviews for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid() and public.can_review(target_id));
drop policy if exists "reviews: удаляю свой" on public.reviews;
create policy "reviews: удаляю свой" on public.reviews for delete to authenticated using (author_id = auth.uid());

-- Средняя оценка для профилей и бейджей биржи
create or replace function public.rating_of(p_users uuid[]) returns table (user_id uuid, avg numeric, n int)
language sql security definer set search_path = public stable as $$
  select target_id, round(avg(rating)::numeric, 1), count(*)::int from reviews where target_id = any(p_users) group by target_id;
$$;
revoke execute on function public.rating_of(uuid[]) from public;
grant execute on function public.rating_of(uuid[]) to anon, authenticated;

-- ============ Учёт времени ============
create table if not exists public.time_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  client_id  uuid references public.clients(id) on delete set null,
  title      text not null default '' check (char_length(title) <= 120),
  started_at timestamptz not null default now(),
  ended_at   timestamptz check (ended_at is null or ended_at >= started_at),
  rate       numeric(12, 2) not null default 0 check (rate >= 0 and rate < 10000000),
  invoice_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists time_user on public.time_entries(user_id, started_at desc);
-- Одновременно может идти только один таймер
create unique index if not exists time_one_running on public.time_entries(user_id) where ended_at is null;

-- ============ Счета ============
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  number      int not null,
  client_id   uuid references public.clients(id) on delete set null,
  client_name text not null default '' check (char_length(client_name) <= 120),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50),
  total       numeric(14, 2) not null default 0 check (total >= 0 and total < 1000000000000),
  status      text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  due_date    date,
  note        text not null default '' check (char_length(note) <= 1000),
  requisites  text not null default '' check (char_length(requisites) <= 1000),
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, number)
);
create index if not exists invoices_user on public.invoices(user_id, created_at desc);
alter table public.time_entries drop constraint if exists time_entries_invoice_fk;
alter table public.time_entries add constraint time_entries_invoice_fk foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table public.time_entries enable row level security;
alter table public.invoices enable row level security;
drop policy if exists "time: только свои" on public.time_entries;
create policy "time: только свои" on public.time_entries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "invoices: только свои" on public.invoices;
create policy "invoices: только свои" on public.invoices for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
