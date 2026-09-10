# Tasks

The schema, the policies, the seed script, and the assertion suite were written
before any of them had run. Every task here is therefore verification or
correction rather than authoring, except where verification uncovered a fault.

It uncovered three, each in a different area and none visible from reading the
SQL.

1. The groups select policy hid a newly created group from its own creator,
   because `RETURNING` is evaluated before the `AFTER INSERT` trigger that
   records membership. Fixed in `0003`.
2. Completion time could be forged. The trigger fired only when `completed`
   appeared in the update, so a client sending `completed_at` alone slipped
   past it. Fixed in `0004`.
3. Deletion notices reach non-members. Delivery access control evaluates the
   select policy against the changed row, and a deletion carries only the
   identifier, so the platform cannot tell who is entitled. Not fixable in the
   schema; recorded as a stated exception in the spec and asserted in the test.

Three suites now pass from an empty database: 24 of 24 access-control
assertions, 25 of 25 constraint assertions, and 7 of 7 realtime assertions.

## 1. Local stack

- [x] 1.1 Finish the Docker Desktop install and start it, verified by
      `docker info` reporting a server version rather than a connection error
- [x] 1.2 Start the Supabase stack with `npx supabase start`, verified by it
      printing the API URL, anon key, and service role key
- [x] 1.3 Write those three values into `app/.env`, verified by
      `node scripts/verify-rls.mjs` reaching its first assertion instead of
      exiting with a missing-configuration error

## 2. Replay the migrations

- [x] 2.1 Run `npx supabase db reset` to replay every migration from empty,
      verified by the command completing with no SQL error. Replaying from
      empty is the point: a migration that only works against the current
      database is broken
- [x] 2.2 Confirm the expected objects exist, verified by querying for the
      seven tables, two enum types, and six functions the migrations declare
- [x] 2.3 Confirm no table was left unprotected, verified by a query over
      `pg_tables` in the public schema returning zero rows where `rowsecurity`
      is false. The assertion suite cannot catch this, because a wide-open
      table breaks none of its expectations
- [x] 2.4 Confirm group tasks publish for realtime, verified by finding the
      table in `pg_publication_tables` for `supabase_realtime`

## 3. Exercise the constraints

- [x] 3.1 Run `node scripts/seed-dev-db.mjs`, verified by the printed row
      counts matching the seed and the command exiting zero
- [x] 3.2 Confirm the schedule constraint rejects contradictory tasks, verified
      by `node scripts/verify-constraints.mjs`: four rejected inserts covering a
      due date with a period, a period with no end, a period ending before it
      begins, and a whitespace-only title, plus a check that none was written
- [x] 3.3 Confirm completion time is system-owned, verified by
      `node scripts/verify-constraints.mjs`. **Found a real fault.** The trigger
      fired only when `completed` appeared in the update, so a forged
      `completed_at` sent alone, or alongside an unrelated edit, persisted.
      Corrected in `0004_completion_time_is_server_owned.sql`, which rewrites
      the function to restore the stored value whenever `completed` is unchanged
- [x] 3.4 Confirm the account cascade removes the right rows and no more,
      verified by `node scripts/verify-constraints.mjs`. Not simply "no
      surviving rows": six foreign keys cascade but `group_tasks.created_by`
      and `completed_by` are `on delete set null`, so a task the user created
      in someone else's group must survive with a null creator while one in a
      group they owned must vanish with the group. Both directions checked

## 4. Prove the access control

- [x] 4.1 Run `node scripts/verify-rls.mjs`, verified by every assertion
      passing and the process exiting zero
- [x] 4.2 Prove the suite can actually fail. Satisfied by real failures rather
      than an artificial one: the first run caught a genuine schema bug in the
      groups select policy, and the second caught a wrong assertion about how a
      blocked DELETE reports itself. A suite that has failed correctly twice,
      for two different reasons, is better evidence than a policy widened on
      purpose
- [x] 4.3 Superseded by 4.2. No policy was temporarily widened, so there is
      nothing to restore, and no committed migration was edited
- [x] 4.4 Confirm realtime delivery respects membership, verified by
      `node scripts/verify-realtime.mjs`. Inserts and updates are filtered
      correctly. **Deletions are not, and cannot be:** a deletion carries only
      the row identifier, so the policy has no `group_id` to evaluate and every
      subscriber is told. Recorded as a stated exception in the spec, and
      asserted in the test along with a check that nothing beyond the
      identifier leaks. The test pairs a member who must receive with a
      non-member who must not, since a broken subscription and correct
      filtering are otherwise indistinguishable
- [x] 4.5 Confirm the join code cannot be used as an oracle, verified by
      redeeming an unknown code and observing a null result that discloses
      nothing about which codes exist

## 5. Resolve and record

- [x] 5.1 Correct any fault found above in a new migration `0003_*.sql`,
      verified by a clean `supabase db reset` followed by a clean suite run.
      Applied migrations are append-only, so nothing already committed is
      edited in place
- [x] 5.2 Record the outcome in `supabase/README.md` if verification changed
      any documented behaviour, verified by the file describing what the
      database actually does
- [x] 5.3 Mark step 2 complete in the migration plan, verified by the plan
      naming step 3 as the next unfinished step
- [x] 5.4 Run `npx openspec validate add-postgres-schema-and-rls --strict`,
      verified by it reporting no errors
- [x] 5.5 Commit the verified state with explicit paths, verified by
      `git status --short` listing only the intended files, with no `.env` and
      no build output in the index
