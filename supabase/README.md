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

## Verifying a change

After any migration that adds a table or changes a policy, reset the database
and re-run the checks. Policies are easy to get wrong in ways that read
correctly, so a change is not done until it has been exercised with real
requests from more than one caller.
