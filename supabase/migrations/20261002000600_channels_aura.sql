-- Каналы с юзернеймами и приглашениями, стикеры, команда поддержки, AURA

-- ============ Каналы и группы: юзернейм, оформление, вход ============
alter table public.chats
  add column if not exists username       text unique check (username is null or username ~ '^[a-z0-9_]{4,32}$'),
  add column if not exists banner_preset  text not null default 'aurora' check (char_length(banner_preset) <= 20),
  add column if not exists banner         text check (banner is null or char_length(banner) <= 400000),
  add column if not exists pinned_message uuid references public.messages(id) on delete set null,
  add column if not exists sign_posts     boolean not null default true,
  add column if not exists join_mode      text not null default 'invite' check (join_mode in ('open', 'request', 'invite')),
  add column if not exists support_status text not null default 'open' check (support_status in ('open', 'resolved'));

grant update (username, banner_preset, banner, pinned_message, sign_posts, join_mode) on public.chats to authenticated;

-- ============ Пригласительные ссылки и заявки ============
create table if not exists public.chat_invites (
  code       text primary key default encode(gen_random_bytes(6), 'hex'),
  chat_id    uuid not null references public.chats(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  mode       text not null default 'join' check (mode in ('join', 'request')),
  max_uses   integer check (max_uses is null or max_uses between 1 and 100000),
  uses       integer not null default 0,
  expires_at timestamptz,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.join_requests (
  chat_id    uuid not null references public.chats(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
alter table public.chat_invites enable row level security;
alter table public.join_requests enable row level security;
drop policy if exists "invites: админы" on public.chat_invites;
create policy "invites: админы" on public.chat_invites for all to authenticated
  using (public.chat_role(chat_id) in ('owner', 'admin')) with check (public.chat_role(chat_id) in ('owner', 'admin') and created_by = auth.uid());
drop policy if exists "requests: свои и админам" on public.join_requests;
create policy "requests: свои и админам" on public.join_requests for select using (user_id = auth.uid() or public.chat_role(chat_id) in ('owner', 'admin'));
drop policy if exists "requests: отозвать свою" on public.join_requests;
create policy "requests: отозвать свою" on public.join_requests for delete using (user_id = auth.uid() or public.chat_role(chat_id) in ('owner', 'admin'));

-- Карточка чата для ссылки-приглашения или публичного юзернейма (без сообщений)
create or replace function public.chat_card(p_code text default null, p_username text default null)
returns table (chat_id uuid, kind text, title text, description text, avatar text, accent text, emoji text, username text,
               banner_preset text, banner text, member_count int, joined boolean, requested boolean, mode text, valid boolean)
language plpgsql security definer set search_path = public stable as $$
declare inv chat_invites; c chats;
begin
  if p_code is not null then
    select * into inv from chat_invites where code = p_code;
    if inv is null then return; end if;
    select * into c from chats where id = inv.chat_id;
  else
    select * into c from chats where chats.username = lower(p_username) and kind in ('group', 'channel');
    if c is null then return; end if;
  end if;
  return query select c.id, c.kind, c.title, c.description, c.avatar, c.accent, c.emoji, c.username, c.banner_preset, c.banner,
    (select count(*)::int from chat_members m where m.chat_id = c.id),
    exists (select 1 from chat_members m where m.chat_id = c.id and m.user_id = auth.uid()),
    exists (select 1 from join_requests r where r.chat_id = c.id and r.user_id = auth.uid()),
    case when inv.code is not null then inv.mode when c.is_public or c.join_mode = 'open' then 'join' when c.join_mode = 'request' then 'request' else 'invite' end,
    case when inv.code is not null then not inv.revoked and (inv.expires_at is null or inv.expires_at > now()) and (inv.max_uses is null or inv.uses < inv.max_uses) else true end;
end $$;

-- Вступить по ссылке или по юзернейму: сразу или подать заявку
create or replace function public.join_chat(p_code text default null, p_chat uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv chat_invites; c chats; m text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_code is not null then
    select * into inv from chat_invites where code = p_code for update;
    if inv is null or inv.revoked or (inv.expires_at is not null and inv.expires_at < now()) or (inv.max_uses is not null and inv.uses >= inv.max_uses) then return 'invalid'; end if;
    select * into c from chats where id = inv.chat_id; m := inv.mode;
  else
    select * into c from chats where id = p_chat and kind in ('group', 'channel');
    if c is null then return 'invalid'; end if;
    m := case when c.is_public or c.join_mode = 'open' then 'join' when c.join_mode = 'request' then 'request' else 'invite' end;
    if m = 'invite' then return 'invite_only'; end if;
  end if;
  if exists (select 1 from chat_members where chat_id = c.id and user_id = me) then return 'member'; end if;
  if m = 'request' then
    insert into join_requests (chat_id, user_id) values (c.id, me) on conflict do nothing;
    return 'requested';
  end if;
  insert into chat_members (chat_id, user_id) values (c.id, me) on conflict do nothing;
  if inv.code is not null then update chat_invites set uses = uses + 1 where code = inv.code; end if;
  return 'joined';
end $$;

create or replace function public.review_request(p_chat uuid, p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.chat_role(p_chat) not in ('owner', 'admin') then raise exception 'not allowed'; end if;
  delete from join_requests where chat_id = p_chat and user_id = p_user;
  if p_approve then insert into chat_members (chat_id, user_id) values (p_chat, p_user) on conflict do nothing; end if;
end $$;

create or replace function public.chat_requests(p_chat uuid) returns table (user_id uuid, username text, display_name text, avatar text, accent text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.user_id, p.username, p.display_name, p.avatar, p.accent, r.created_at
  from join_requests r join profiles p on p.id = r.user_id
  where r.chat_id = p_chat and public.chat_role(p_chat) in ('owner', 'admin') order by r.created_at;
$$;

-- Публичные каналы человека — для профиля
create or replace function public.user_channels(p_user uuid) returns table (chat_id uuid, title text, username text, avatar text, accent text, emoji text, description text, member_count int)
language sql security definer set search_path = public stable as $$
  select c.id, c.title, c.username, c.avatar, c.accent, c.emoji, c.description, (select count(*)::int from chat_members m where m.chat_id = c.id)
  from chats c where c.kind = 'channel' and c.is_public and c.owner_id = p_user order by c.updated_at desc;
$$;

-- ============ Стикеры ============
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'voice', 'file', 'system', 'sticker'));
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (char_length(text) <= 2000 and (kind not in ('text', 'system', 'sticker') or char_length(trim(text)) >= 1));
alter table public.messages drop constraint if exists messages_media_check;
alter table public.messages add constraint messages_media_check
  check (kind in ('text', 'system', 'sticker') or (media_path is not null and split_part(media_path, '/', 1) = chat_id::text));

-- ============ Поддержка: команда и статус обращения ============
alter table public.profiles add column if not exists is_support boolean not null default false;
alter table public.profiles add column if not exists looking_for text not null default '' check (char_length(looking_for) <= 200);
update public.profiles set is_support = true where username in ('fedonko', 'awiny');
-- флаг команды ставится только из SQL
create or replace function public.protect_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'postgres' then
    new.role := old.role;
    new.is_support := old.is_support;
  end if;
  return new;
end $$;

create or replace function public.open_support() returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into cid from chats where kind = 'support' and support_for = me;
  if cid is not null then return cid; end if;
  insert into chats (kind, title, support_for, accent) values ('support', 'Поддержка', me, 'brand') returning id into cid;
  insert into chat_members (chat_id, user_id, role, last_read_at) values (cid, me, 'member', now());
  insert into chat_members (chat_id, user_id, role) select cid, id, 'admin' from profiles where is_support and id <> me on conflict do nothing;
  insert into messages (chat_id, sender_id, kind, text)
    values (cid, me, 'system', 'Это чат с командой платформы. Опиши, что случилось или что хочешь предложить, мы ответим здесь.');
  return cid;
end $$;

create or replace function public.set_support_status(p_chat uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_support) or p_status not in ('open', 'resolved') then raise exception 'not allowed'; end if;
  update chats set support_status = p_status where id = p_chat and kind = 'support';
  insert into messages (chat_id, sender_id, kind, text) values (p_chat, auth.uid(), 'system', case when p_status = 'resolved' then 'Команда отметила обращение решённым' else 'Обращение снова открыто' end);
end $$;

-- Новое сообщение от человека снова открывает обращение
create or replace function public.reopen_support() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update chats set support_status = 'open' where id = new.chat_id and kind = 'support' and support_for = new.sender_id and support_status = 'resolved';
  return new;
end $$;
drop trigger if exists messages_reopen_support on public.messages;
create trigger messages_reopen_support after insert on public.messages for each row execute function public.reopen_support();

-- ============ AURA ============
create table if not exists public.activity_days (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;
drop policy if exists "activity: отмечаю себя сегодня" on public.activity_days;
create policy "activity: отмечаю себя сегодня" on public.activity_days for insert to authenticated with check (user_id = auth.uid() and day = current_date);
drop policy if exists "activity: вижу свои" on public.activity_days;
create policy "activity: вижу свои" on public.activity_days for select using (user_id = auth.uid());

-- Правила AURA (вклады с потолками, чтобы нельзя было накрутить):
--  Proof of Work +30 (до 20 работ) · проект +40 (до 10) · этап проекта готов +10 (до 50)
--  цель покорена +50 (до 20) · задача выполнена +2 (до 150) · друг +5 (до 100)
--  подписчик твоих каналов +2 (до 500) · активный день +3 (последние 60 дней) · статья в Обучении +80
create or replace function public.aura_table() returns table (
  user_id uuid, aura int, works int, projects int, milestones int, goals int, tasks int, friends int, subs int, days int, articles int
)
language sql security definer set search_path = public stable as $$
  with p as (select id from profiles),
  w as (select user_id, count(*)::int n from works group by user_id),
  pr as (select user_id, count(*)::int n from projects group by user_id),
  ms as (select p.user_id, count(*)::int n from project_milestones m join projects p on p.id = m.project_id where m.status = 'done' group by p.user_id),
  g as (select user_id, count(*)::int n from goals where done group by user_id),
  t as (select user_id, sum(n)::int n from (select user_id, count(*) n from tasks where done group by user_id union all select user_id, count(*) n from plan_tasks where done group by user_id) x group by user_id),
  f as (select u, count(*)::int n from (select requester u from friendships where status = 'accepted' union all select addressee from friendships where status = 'accepted') x group by u),
  s as (select c.owner_id u, count(*)::int n from chats c join chat_members m on m.chat_id = c.id and m.user_id <> c.owner_id where c.kind = 'channel' group by c.owner_id),
  d as (select user_id, count(*)::int n from activity_days where day > current_date - 60 group by user_id),
  a as (select author_id, count(*)::int n from articles where published group by author_id)
  select p.id,
    (least(coalesce(w.n,0),20)*30 + least(coalesce(pr.n,0),10)*40 + least(coalesce(ms.n,0),50)*10 + least(coalesce(g.n,0),20)*50
     + least(coalesce(t.n,0),150)*2 + least(coalesce(f.n,0),100)*5 + least(coalesce(s.n,0),500)*2 + coalesce(d.n,0)*3 + coalesce(a.n,0)*80)::int,
    coalesce(w.n,0), coalesce(pr.n,0), coalesce(ms.n,0), coalesce(g.n,0), coalesce(t.n,0), coalesce(f.n,0), coalesce(s.n,0), coalesce(d.n,0), coalesce(a.n,0)
  from p
  left join w on w.user_id = p.id left join pr on pr.user_id = p.id left join ms on ms.user_id = p.id left join g on g.user_id = p.id
  left join t on t.user_id = p.id left join f on f.u = p.id left join s on s.u = p.id left join d on d.user_id = p.id left join a on a.author_id = p.id;
$$;

create or replace function public.leaderboard(p_niche text default null, p_limit int default 100) returns table (
  rank int, user_id uuid, username text, display_name text, avatar text, accent text, niches text, role text, is_support boolean,
  aura int, works int, projects int, milestones int, goals int, tasks int, friends int, subs int, days int, articles int
)
language sql security definer set search_path = public stable as $$
  select (row_number() over (order by a.aura desc, pr.created_at))::int, pr.id, pr.username, pr.display_name, pr.avatar, pr.accent, pr.niches, pr.role, pr.is_support,
         a.aura, a.works, a.projects, a.milestones, a.goals, a.tasks, a.friends, a.subs, a.days, a.articles
  from aura_table() a join profiles pr on pr.id = a.user_id
  where p_niche is null or pr.niches like '%' || p_niche || '%'
  order by a.aura desc, pr.created_at
  limit least(coalesce(p_limit, 100), 500);
$$;

create or replace function public.my_aura(p_user uuid) returns int
language sql security definer set search_path = public stable as $$
  select aura from aura_table() where user_id = p_user;
$$;

-- ============ Права ============
revoke execute on function public.chat_card(text, text), public.join_chat(text, uuid), public.review_request(uuid, uuid, boolean), public.chat_requests(uuid),
  public.user_channels(uuid), public.set_support_status(uuid, text), public.aura_table(), public.leaderboard(text, int), public.my_aura(uuid) from public;
grant execute on function public.chat_card(text, text), public.user_channels(uuid), public.leaderboard(text, int), public.my_aura(uuid) to anon, authenticated;
grant execute on function public.join_chat(text, uuid), public.review_request(uuid, uuid, boolean), public.chat_requests(uuid), public.set_support_status(uuid, text) to authenticated;
revoke execute on function public.aura_table(), public.reopen_support() from anon, authenticated;
