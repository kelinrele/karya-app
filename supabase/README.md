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

## Verifying a change

After any migration that adds a table or changes a policy, reset the database
and re-run the checks. Policies are easy to get wrong in ways that read
correctly, so a change is not done until it has been exercised with real
requests from more than one caller.

```bash
npx supabase db reset          # replay every migration from empty
node scripts/seed-dev-db.mjs   # realistic data, including awkward cases
node scripts/verify-rls.mjs    # 24 assertions across three callers
```

The suite drives the API as an anonymous caller and as two separate users. It
has caught both a real schema fault and a wrong assertion, which is the
evidence that it does something. Never weaken an assertion to make it pass:
decide whether the policy or the expectation is wrong, in that order.
