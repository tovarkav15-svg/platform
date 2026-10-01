-- Проект: цель, этапы, задачи. Workspace: клиенты, планы, финансы

-- ============ Проект: цель и прогресс ============
alter table public.projects
  add column if not exists goal_label   text not null default '' check (char_length(goal_label) <= 60),
  add column if not exists goal_target  integer not null default 0 check (goal_target between 0 and 1000000000),
  add column if not exists goal_current integer not null default 0 check (goal_current between 0 and 1000000000);

-- Автор или участник команды
create or replace function public.is_project_team(p uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from projects where id = p and user_id = auth.uid())
      or exists (select 1 from project_members where project_id = p and user_id = auth.uid());
$$;
revoke execute on function public.is_project_team(uuid) from public, anon;
grant execute on function public.is_project_team(uuid) to authenticated;

-- Команда может двигать прогресс, но не менять остальное в проекте
create or replace function public.set_project_progress(p uuid, v integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_project_team(p) then raise exception 'not allowed'; end if;
  update projects set goal_current = greatest(0, least(v, 1000000000)), updated_at = now() where id = p;
end $$;
revoke execute on function public.set_project_progress(uuid, integer) from public, anon;
grant execute on function public.set_project_progress(uuid, integer) to authenticated;

create table if not exists public.project_milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 80),
  status     text not null default 'todo' check (status in ('todo', 'current', 'done')),
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists milestones_project on public.project_milestones(project_id, position);

create table if not exists public.project_tasks (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 160),
  done       boolean not null default false,
  assignee   uuid references public.profiles(id) on delete set null,
  due_date   date,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ptasks_project on public.project_tasks(project_id, done, created_at);

alter table public.project_milestones enable row level security;
alter table public.project_tasks enable row level security;

drop policy if exists "milestones: все читают" on public.project_milestones;
create policy "milestones: все читают" on public.project_milestones for select using (true);
drop policy if exists "milestones: команда правит" on public.project_milestones;
create policy "milestones: команда правит" on public.project_milestones for all to authenticated
  using (public.is_project_team(project_id)) with check (public.is_project_team(project_id));

drop policy if exists "ptasks: все читают" on public.project_tasks;
create policy "ptasks: все читают" on public.project_tasks for select using (true);
drop policy if exists "ptasks: команда правит" on public.project_tasks;
create policy "ptasks: команда правит" on public.project_tasks for all to authenticated
  using (public.is_project_team(project_id)) with check (public.is_project_team(project_id));

-- ============ Workspace: настройки ============
create table if not exists public.workspace_settings (
  user_id        uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  client_columns jsonb not null default '[]'::jsonb,
  sync_earnings  boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- ============ Clients ============
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  username   text not null default '' check (char_length(username) <= 60),
  sphere     text not null default '' check (char_length(sphere) <= 120),
  qualify    text not null default '' check (char_length(qualify) <= 40),
  hypothesis text not null default '' check (char_length(hypothesis) <= 1000),
  outcome    text not null default '' check (char_length(outcome) <= 40),
  comment    text not null default '' check (char_length(comment) <= 2000),
  extra      jsonb not null default '{}'::jsonb,
  position   double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_user on public.clients(user_id, position);

-- ============ Plans (как TickTick) ============
create table if not exists public.plan_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  color      text not null default 'ai',
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.plan_tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  list_id    uuid references public.plan_lists(id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 200),
  notes      text not null default '' check (char_length(notes) <= 4000),
  due_date   date,
  due_time   time,
  priority   smallint not null default 0 check (priority between 0 and 3),
  tags       text[] not null default '{}',
  subtasks   jsonb not null default '[]'::jsonb,
  repeat     text not null default '' check (repeat in ('', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  done       boolean not null default false,
  done_at    timestamptz,
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists plan_tasks_user on public.plan_tasks(user_id, done, due_date);

-- ============ Финансы ============
create table if not exists public.fin_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type       text not null check (type in ('income', 'expense')),
  amount     numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  category   text not null default '' check (char_length(category) <= 40),
  date       date not null default current_date,
  note       text not null default '' check (char_length(note) <= 300),
  client_id  uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fin_tx_user on public.fin_transactions(user_id, date desc);

create table if not exists public.fin_payments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  direction  text not null check (direction in ('in', 'out')),
  title      text not null check (char_length(trim(title)) between 1 and 80),
  amount     numeric(14, 2) not null check (amount > 0 and amount < 1000000000000),
  category   text not null default '' check (char_length(category) <= 40),
  due_date   date not null,
  repeat     text not null default '' check (repeat in ('', 'monthly', 'weekly', 'yearly')),
  status     text not null default 'planned' check (status in ('planned', 'paid')),
  client_id  uuid references public.clients(id) on delete set null,
  note       text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists fin_pay_user on public.fin_payments(user_id, status, due_date);

-- Всё в Workspace видит только владелец
do $$
declare t text;
begin
  foreach t in array array['workspace_settings', 'clients', 'plan_lists', 'plan_tasks', 'fin_transactions', 'fin_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "только владелец" on public.%I', t);
    execute format('create policy "только владелец" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Задача плана не может лежать в чужом списке
create or replace function public.plan_task_list_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.list_id is not null and not exists (select 1 from plan_lists where id = new.list_id and user_id = new.user_id) then
    raise exception 'list not found';
  end if;
  return new;
end $$;
drop trigger if exists plan_tasks_list_owner on public.plan_tasks;
create trigger plan_tasks_list_owner before insert or update on public.plan_tasks
  for each row execute function public.plan_task_list_owner();

-- Клиент в финансах только свой
create or replace function public.fin_client_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and not exists (select 1 from clients where id = new.client_id and user_id = new.user_id) then
    raise exception 'client not found';
  end if;
  return new;
end $$;
drop trigger if exists fin_tx_client_owner on public.fin_transactions;
create trigger fin_tx_client_owner before insert or update on public.fin_transactions
  for each row execute function public.fin_client_owner();
drop trigger if exists fin_pay_client_owner on public.fin_payments;
create trigger fin_pay_client_owner before insert or update on public.fin_payments
  for each row execute function public.fin_client_owner();

revoke execute on function public.plan_task_list_owner(), public.fin_client_owner() from public, anon, authenticated;
