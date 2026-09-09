-- Shared group lists.
--
-- Replaces the previous document shape, where a group held its tasks in a
-- nested array. Every toggle rewrote the whole array, so two members editing
-- at once lost a write. Group tasks are real rows here and that class of bug
-- disappears.

-- ----------------------------------------------------------------- tables

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  join_code  text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on column public.groups.join_code is
  'Six uppercase alphanumerics. Redeemed through join_group_with_code, never selected directly.';

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_tasks (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  text         text not null check (length(btrim(text)) > 0),
  completed    boolean not null default false,
  created_by   uuid references auth.users (id) on delete set null,
  completed_by uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index group_tasks_group_idx on public.group_tasks (group_id, created_at);

create trigger group_tasks_set_updated_at
  before update on public.group_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- helpers

-- Membership check used by every policy below.
--
-- This exists to break RLS recursion. A policy on group_members that queries
-- group_members re-enters its own policy and Postgres raises "infinite
-- recursion detected in policy". A security definer function runs with the
-- owner's rights, bypassing RLS for this one lookup, which cuts the cycle.
--
-- It is safe because it takes only a group id and answers strictly about the
-- calling user. It cannot be used to enumerate anything.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Redeeming a join code is a privileged lookup by design.
--
-- A member cannot select a group they have not joined, so they cannot find a
-- group by its code through a normal query. This function performs that one
-- lookup with elevated rights and adds the caller as a member. It returns the
-- group id, or null when the code is unknown, and never reveals anything else
-- about groups the caller is not in.
create or replace function public.join_group_with_code(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_user_id  uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select id into v_group_id
  from public.groups
  where join_code = upper(btrim(p_join_code));

  if v_group_id is null then
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

revoke all on function public.join_group_with_code(text) from public;
grant execute on function public.join_group_with_code(text) to authenticated;

-- The creator is always the first member, so the client cannot create a group
-- it is not in.
create or replace function public.add_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

create trigger groups_add_owner_as_member
  after insert on public.groups
  for each row execute function public.add_owner_as_member();

-- -------------------------------------------------------------------- RLS

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_tasks   enable row level security;

create policy "groups are readable by members"
  on public.groups for select
  using (public.is_group_member(id));

create policy "groups are created by their owner"
  on public.groups for insert
  with check ((select auth.uid()) = owner_id);

create policy "groups are updatable by their owner"
  on public.groups for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "groups are deletable by their owner"
  on public.groups for delete
  using ((select auth.uid()) = owner_id);

create policy "membership is readable by fellow members"
  on public.group_members for select
  using (public.is_group_member(group_id));

-- Members leave on their own. Owners may also remove anyone.
create policy "membership is removable by self or owner"
  on public.group_members for delete
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = (select auth.uid())
    )
  );

-- No insert policy on group_members. Joining goes through
-- join_group_with_code so a code is required, and group creation goes through
-- the owner trigger. Direct inserts are denied.

create policy "group tasks are readable by members"
  on public.group_tasks for select
  using (public.is_group_member(group_id));

create policy "group tasks are insertable by members"
  on public.group_tasks for insert
  with check (
    public.is_group_member(group_id)
    and (select auth.uid()) = created_by
  );

create policy "group tasks are updatable by members"
  on public.group_tasks for update
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy "group tasks are deletable by members"
  on public.group_tasks for delete
  using (public.is_group_member(group_id));

-- --------------------------------------------------------------- realtime

-- Group tasks are the only table that needs to push. Personal tables are
-- single-device-at-a-time in practice and do not justify the connection.
alter publication supabase_realtime add table public.group_tasks;
