-- Let a group's owner read it without depending on the membership table.
--
-- Creating a group failed whenever the caller asked for the created row back,
-- which is what PostgREST does for `Prefer: return=representation` and what the
-- client library does for `.insert().select()`. A plain INSERT succeeded and an
-- INSERT ... RETURNING was refused with "new row violates row-level security
-- policy for table groups".
--
-- The cause is evaluation order rather than the insert policy. RETURNING is
-- evaluated before AFTER INSERT triggers fire, so at that moment
-- add_owner_as_member has not yet written the owner's membership row. The
-- select policy asked is_group_member(id), which was therefore false, and the
-- row the caller had just legitimately created was hidden from them.
--
-- Making the trigger BEFORE INSERT is not an option: the group row must exist
-- before a membership row can reference it.
--
-- So ownership is recognised directly. This is also the more honest rule. An
-- owner should be able to read their own group because they own it, not
-- because a trigger happened to record them in a second table. The membership
-- clause stays for everyone else.

drop policy "groups are readable by members" on public.groups;

create policy "groups are readable by owners and members"
  on public.groups for select
  using (
    (select auth.uid()) = owner_id
    or public.is_group_member(id)
  );

comment on table public.groups is
  'Readable by the owner directly, and by members through is_group_member. The owner clause is required because RETURNING is evaluated before the AFTER INSERT trigger that records their membership.';
