-- Core personal data: profiles, tasks, ideas, daily completion counts.
--
-- Every table here is owned by exactly one user and is protected by Row Level
-- Security from the moment it is created. RLS is enabled in the same migration
-- as the table on purpose: a table that exists for even one migration without
-- RLS is a table that can be read by anyone holding the anon key.

-- ---------------------------------------------------------------- helpers

-- Keeps updated_at honest without the client having to remember.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created automatically on signup.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Populate a profile the moment an auth user appears, so application code
-- never has to handle a missing profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ tasks

create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_schedule_type as enum ('due_date', 'time_period');

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  text              text not null check (length(btrim(text)) > 0),
  priority          public.task_priority not null default 'medium',
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  completed         boolean not null default false,
  completed_at      timestamptz,
  schedule_type     public.task_schedule_type not null default 'due_date',
  due_date          date,
  due_time          time,
  begins_at         timestamptz,
  ends_at           timestamptz,

  -- Substeps stay denormalised. They are always read with their parent task
  -- and are never queried independently, so a child table would buy nothing
  -- but joins. Shape: [{ "text": string, "completed": boolean }]
  substeps          jsonb not null default '[]'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tasks_substeps_is_array
    check (jsonb_typeof(substeps) = 'array'),

  -- A task is scheduled one way or the other, never both, never neither.
  constraint tasks_schedule_shape check (
    (schedule_type = 'due_date'
      and begins_at is null
      and ends_at is null)
    or
    (schedule_type = 'time_period'
      and begins_at is not null
      and ends_at is not null
      and ends_at > begins_at
      and due_date is null
      and due_time is null)
  )
);

comment on column public.tasks.substeps is
  'Array of { text, completed }. Denormalised deliberately, always read with the parent.';

-- Drives the main list: a user's open tasks in due order.
create index tasks_user_open_due_idx
  on public.tasks (user_id, completed, due_date nulls last);

-- Drives overdue detection on the time-period branch.
create index tasks_user_ends_at_idx
  on public.tasks (user_id, ends_at)
  where ends_at is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- completed_at follows completed, rather than trusting the client to send both.
create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.completed and not coalesce(old.completed, false) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_completed_at
  before insert or update of completed on public.tasks
  for each row execute function public.sync_task_completed_at();

-- ------------------------------------------------------------------ ideas

create table public.ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  text       text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.ideas is
  'Quick capture inbox. An idea is promoted by creating a task and deleting the idea.';

create index ideas_user_created_idx
  on public.ideas (user_id, created_at desc);

-- ----------------------------------------------------- daily completions

create table public.daily_completions (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             date not null,
  tasks_completed integer not null default 0 check (tasks_completed >= 0),
  primary key (user_id, day)
);

comment on table public.daily_completions is
  'One row per user per active day. Streak length is derived by walking days backwards, not stored.';

-- -------------------------------------------------------------------- RLS

alter table public.profiles          enable row level security;
alter table public.tasks             enable row level security;
alter table public.ideas             enable row level security;
alter table public.daily_completions enable row level security;

-- auth.uid() is wrapped in a scalar subquery throughout. Postgres then caches
-- it as an InitPlan and evaluates it once per statement rather than once per
-- row, which matters as soon as a user has more than a handful of tasks.

create policy "profiles are readable by their owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "tasks are readable by their owner"
  on public.tasks for select
  using ((select auth.uid()) = user_id);

create policy "tasks are insertable by their owner"
  on public.tasks for insert
  with check ((select auth.uid()) = user_id);

create policy "tasks are updatable by their owner"
  on public.tasks for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "tasks are deletable by their owner"
  on public.tasks for delete
  using ((select auth.uid()) = user_id);

create policy "ideas are readable by their owner"
  on public.ideas for select
  using ((select auth.uid()) = user_id);

create policy "ideas are insertable by their owner"
  on public.ideas for insert
  with check ((select auth.uid()) = user_id);

create policy "ideas are deletable by their owner"
  on public.ideas for delete
  using ((select auth.uid()) = user_id);

create policy "completions are readable by their owner"
  on public.daily_completions for select
  using ((select auth.uid()) = user_id);

create policy "completions are insertable by their owner"
  on public.daily_completions for insert
  with check ((select auth.uid()) = user_id);

create policy "completions are updatable by their owner"
  on public.daily_completions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy on daily_completions. Streak history is append-only; a
-- missing policy denies the operation, which is the intent.
