-- Обучение: статьи по нишам. Читают все, пишут владельцы платформы (role = owner)
create table if not exists public.articles (
  id          uuid primary key default gen_random_uuid(),
  niche       text not null check (char_length(niche) between 1 and 30),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  title       text not null check (char_length(trim(title)) between 3 and 120),
  summary     text not null default '' check (char_length(summary) <= 300),
  body        text not null default '' check (char_length(body) <= 60000),
  cover_path  text check (cover_path is null or char_length(cover_path) <= 200),
  level       text not null default 'start' check (level in ('start', 'middle', 'pro')),
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  published   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists articles_niche on public.articles(niche, published, position, created_at);

create or replace function public.is_platform_owner() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'founder'));
$$;
revoke execute on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

alter table public.articles enable row level security;
drop policy if exists "articles: читают опубликованные" on public.articles;
create policy "articles: читают опубликованные" on public.articles for select using (published or public.is_platform_owner());
drop policy if exists "articles: пишут владельцы" on public.articles;
create policy "articles: пишут владельцы" on public.articles for all to authenticated
  using (public.is_platform_owner()) with check (public.is_platform_owner());

-- Публичное число статей по нишам (для карточек ниш)
create or replace function public.article_counts() returns table (niche text, n int)
language sql security definer set search_path = public stable as $$
  select niche, count(*)::int from articles where published group by niche;
$$;
grant execute on function public.article_counts() to anon, authenticated;
