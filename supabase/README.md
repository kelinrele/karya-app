# Supabase

Database schema, policies, and functions for Karya.

Postgres is the source of truth for signed-in users. Guests keep their data in
the browser and never reach this database at all, which is why the application
talks to a repository interface rather than to Supabase directly.

## Getting started

```bash
npm install -g supabase
supabase start
supabase db reset
```

`supabase start` prints the local URL, anon key, and service role key. Copy
them into `app/.env`.

`supabase db reset` drops the local database and replays every migration in
order, which is the only reliable way to confirm the migrations work from
scratch. Run it after writing one.

## Layout

```
supabase/
└── migrations/    ordered SQL migrations, see migrations/README.md
```

## Design decisions

**Row Level Security is enabled in the same migration that creates the table.**
The anon key ships inside the client bundle and is public by design, so
policies are the only access control there is. A table that exists for even one
migration without RLS is readable by anyone holding that key.

**`auth.uid()` is always wrapped as `(select auth.uid())` in policies.**
Postgres then evaluates it once per statement as an InitPlan rather than once
per row. On a list query this is the difference between one call and one call
per task.

**Substeps are JSONB on the task row, not a child table.** They are always read
with their parent and are never queried on their own, so a separate table would
add a join to every read and buy nothing.

**Group tasks are real rows.** The previous document store kept them in a
nested array, so completing one task rewrote the whole array and simultaneous
edits silently lost writes. Rows remove that entire class of bug.

**Membership checks go through `is_group_member`, a security definer
function.** A policy on `group_members` that queries `group_members` re-enters
its own policy and Postgres raises an infinite recursion error. The function
runs with the definer's rights for that one lookup, which breaks the cycle. It
accepts only a group id and answers strictly about the calling user, so it
cannot be used to enumerate anything.

**Joining a group is an RPC, not a select.** A user cannot read a group they
have not joined, so they cannot look one up by its code. `join_group_with_code`
performs that single privileged lookup and adds the caller as a member,
returning null for an unknown code without revealing anything else.

**Streak history has no delete policy.** The omission is deliberate. A missing
policy denies the operation, which is exactly the intent for append-only data.

**A group's owner is recognised directly, not only through membership.** This
looks redundant next to the membership check, and it is not. `RETURNING` is
evaluated before `AFTER INSERT` triggers fire, so when a caller creates a group
and asks for the row back, the trigger that records their membership has not
run yet. Without the ownership clause the select policy hid the row from the
person who had just created it, and creation failed with a policy violation.
That is what `0003_fix_group_insert_returning.sql` corrects.

**Completion time belongs to the database, not the client.** A trigger sets it
when a task is completed, clears it when reopened, and restores the stored
value on any update that does not change the completion flag. A timestamp sent
by a client is always discarded.

This is stricter than it first appears, and deliberately so. The trigger
originally fired only when the completion column itself appeared in a
statement, which meant a client could send a timestamp on its own, or alongside
an unrelated edit, and have it stick. Streak history is derived from these
timestamps, so that was a route to manufacturing a streak.
`0004_completion_time_is_server_owned.sql` closes it.

**Realtime filters inserts and updates by membership, but not deletions.**
Delivery evaluates the select policy against the changed row. A deletion
carries only the row identifier, never the `group_id` the policy needs, so the
platform cannot decide who is entitled and notifies every subscriber of the
table.

No schema setting changes this; it was verified under both replica identity
settings. What leaks is an opaque identifier and the timing of a deletion,
never the group, the text, or the author. A client should therefore not
subscribe to deletions, and should reconcile removals by refetching instead.

## Verifying a change

After any migration that adds a table or changes a policy, reset the database
and re-run the checks. Policies are easy to get wrong in ways that read
correctly, so a change is not done until it has been exercised with real
requests from more than one caller.

```bash
npx supabase db reset               # replay every migration from empty
node scripts/seed-dev-db.mjs        # realistic data, including awkward cases
node scripts/verify-rls.mjs         # who may read and write which rows
node scripts/verify-constraints.mjs # what the data itself must satisfy
node scripts/verify-realtime.mjs    # what subscribers are told
```

Three suites, because a failure that names its own area is worth more than one
number. `verify-rls` drives the API as an anonymous caller and as two separate
users. `verify-constraints` covers the schedule constraint, completion-time
ownership, and the account cascade. `verify-realtime` needs `npm install` at
the repository root; the other two run on bare Node.

Between them they have caught two real schema faults and several wrong
assertions, which is the evidence that they do something. **Never weaken an
assertion to make it pass:** decide whether the schema or the expectation is
wrong, in that order, and record which it turned out to be.

Two habits worth keeping. Pair every negative assertion with a positive
control, because "nothing arrived" and "the connection was broken" are
otherwise indistinguishable. And replay from empty rather than against the
current database, since a migration that only works against today's state is
broken.
