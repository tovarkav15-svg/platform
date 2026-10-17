-- My Projects: учёт времени по проекту (таймер и ручные добавки)
alter table public.ws_projects
  add column if not exists time_spent       integer not null default 0 check (time_spent between 0 and 100000000),
  add column if not exists timer_started_at timestamptz;
