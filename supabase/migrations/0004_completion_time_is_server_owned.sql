-- Stop a client being able to choose a task's completion time.
--
-- The original trigger was declared `before insert or update of completed`.
-- The `of completed` clause means it fires only when that column appears in
-- the statement's column list, so a client sending completed_at on its own,
-- or alongside an unrelated edit, was never intercepted and the value stuck.
--
-- Verified before this migration was written. Sending completed_at alone set
-- it to 2020-01-01; sending it while also toggling `completed` was correctly
-- overridden. That difference is the whole diagnosis: the guard only ran on
-- the one path that happened to mention the column.
--
-- Widening the trigger to a plain `update` is necessary but not sufficient on
-- its own. With `completed` already true and staying true, neither branch of
-- the old function body matched, so a forged value would still have survived.
-- The function has to stop trusting the client outright, which is what the
-- else branch below does: on any update that does not change `completed`, the
-- previous timestamp is restored regardless of what arrived.
--
-- Why this matters beyond tidiness: streak history is derived from these
-- timestamps. A client able to backdate them can manufacture a streak.

create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.completed_at := case when new.completed then now() else null end;

  elsif new.completed is distinct from old.completed then
    -- A real state change, so the timestamp is recomputed.
    new.completed_at := case when new.completed then now() else null end;

  else
    -- No state change. completed_at is not the client's to set, so whatever
    -- arrived is discarded in favour of what was already stored.
    new.completed_at := old.completed_at;
  end if;

  return new;
end;
$$;

-- `is distinct from` rather than `<>` because it is null-safe. `completed` is
-- NOT NULL today, and this keeps working if that ever changes.

drop trigger tasks_sync_completed_at on public.tasks;

create trigger tasks_sync_completed_at
  before insert or update on public.tasks
  for each row execute function public.sync_task_completed_at();

comment on column public.tasks.completed_at is
  'Maintained by sync_task_completed_at. Client-supplied values are always discarded.';
