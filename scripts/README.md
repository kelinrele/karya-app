# `scripts/`

Development scripts for the local Supabase stack. Not part of the shipped
application; nothing here runs in production.

Plain Node. Node 20 or newer.

Three of the four scripts have **no dependencies at all** and talk to PostgREST
and the auth API over `fetch`. Only `verify-realtime.mjs` needs a package,
because hand-rolling a WebSocket protocol would fail in ways indistinguishable
from the bug it is meant to catch. Install once at the repository root:

```bash
npm install
```

| Script | Needs an install |
|---|---|
| `seed-dev-db.mjs` | No |
| `verify-rls.mjs` | No |
| `verify-constraints.mjs` | No |
| `verify-realtime.mjs` | Yes |

## Prerequisites

A local Supabase stack, and the credentials it prints:

```bash
npx supabase start
```

Copy the API URL, anon key, and service role key into `app/.env`. Both scripts
read that file, and also accept the same names from the environment, which wins
over the file.

| Variable | Used for |
|---|---|
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | API endpoint |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | Requests as an ordinary caller |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations, and bypassing access control |

A missing variable produces a named error and exit code `2`, not a stack trace.

## Safety

**Both scripts refuse to run against a non-local URL.** They create and delete
users and rows, so pointing them at a shared project would be destructive.
`--allow-remote` overrides this and should stay unused.

## `seed-dev-db.mjs`

Wipes and reseeds the development database so the interface has something
realistic to render.

```bash
node scripts/seed-dev-db.mjs                # full reset and reseed
node scripts/seed-dev-db.mjs --keep-user    # reseed, keep the existing session
```

Signs in afterwards as `dev@karya.test` with password `karya-dev-password`.

The data deliberately covers awkward cases rather than the happy path: an
overdue task, a task scheduled by period rather than due date, partially
completed substeps, a completed task, a task with no date at all, and fourteen
days of streak history **with a deliberate gap**, so streak logic has to break
a run instead of always counting upward.

Wiping works by deleting the development user and letting foreign keys cascade.
That is both the cleanest reset available and a standing check that the
cascades are correct: a row surviving the user's deletion means a foreign key
is wrong.

`--keep-user` exists because recreating the user invalidates any open browser
session.

## `verify-rls.mjs`

Checks the Row Level Security policies by driving the API as three different
callers: anonymous, user A, and user B. Every assertion is a real request
against a real policy.

```bash
node scripts/verify-rls.mjs           # run and clean up
node scripts/verify-rls.mjs --keep    # leave the test users for inspection
```

Exits `1` if any assertion fails, so it can gate a pipeline.

It covers cross-user reads, writes, updates and deletes; anonymous access;
group visibility for non-members; join codes; and owner-only administration.

**One detail matters more than the rest.** A hidden row and a rejected write
fail differently. When a policy hides a row, the API returns success with an
empty array, and an update against it also succeeds with zero rows affected.
When a policy rejects a write, it returns `401`, `403`, or error code `42501`.
A test that accepts either outcome passes against a completely open database,
because an empty result is indistinguishable from a correct denial unless the
data is known to exist. So the suite inserts B's row, checks A cannot see it,
then confirms with B's own token that the row survived. Without that last step
the whole suite proves nothing.

## `verify-constraints.mjs`

Checks what the database guarantees about its own data, as opposed to who may
read it.

```bash
node scripts/verify-constraints.mjs
node scripts/verify-constraints.mjs --keep    # leave the test users behind
```

Three areas. The **schedule constraint** must refuse a task carrying both a due
date and a period, a period with no end, a period ending before it begins, and
a whitespace-only title, and the rows must be absent afterwards: a constraint
that errors while still writing is worse than none.

**Completion time** must belong to the database. The interesting cases are the
forged ones, sending `completed_at` on its own and smuggling it alongside an
unrelated edit. Both were accepted before `0004`, which matters because streak
history is derived from these timestamps and a client able to backdate them can
manufacture a streak.

The **account cascade** is subtler than it reads, because the eight foreign
keys do not behave alike. Six cascade, but `group_tasks.created_by` and
`completed_by` are `on delete set null`. So a task the deleted user created in
someone else's group must survive with a null creator, while one in a group
they owned must vanish with the group. Checking only that rows disappear would
pass against a schema that deletes far too much.

## `verify-realtime.mjs`

Checks that realtime delivery respects group membership.

```bash
node scripts/verify-realtime.mjs
```

Exits `1` on a failed assertion and `3` when the test could not be established,
which is a distinction worth having.

**The positive control is the test.** Asserting that a non-member receives
nothing proves nothing on its own, because a subscription that silently failed
also receives nothing, and the two are indistinguishable from outside. So a
member subscribes first and *must* receive the insert. Only then does the
non-member's silence mean anything, and a final check confirms the member was
still receiving during the same window.

It also records a limitation rather than wishing it away. Inserts and updates
are filtered by membership; **deletions are not, and cannot be.** A deletion
carries only the row identifier, so the policy has no `group_id` to evaluate
and every subscriber of the table is told. The suite asserts that this is what
happens, and separately that nothing beyond the identifier leaks, so the day
the platform starts filtering deletions the test will fail and say so.

The positive control retries a few times. The realtime service restarts during
`supabase db reset` and takes several seconds to start streaming, so a run
immediately afterwards sees a healthy container that is not yet delivering.
Exhausting the retries still reports inconclusive rather than passing.

## Run receipts

Every script writes a small JSON file to `test-results/` on exit, named for
the script. It records the exit code, the assertion counts, the time, the
commit at the time, and a **content hash** of `supabase/migrations/` and
`scripts/` as they were on disk when the run happened.

A receipt answers one question: does a passing run still speak for what is on
disk now? A checked-off task naming one of these scripts is a claim; the
receipt is what lets the claim be checked rather than taken on trust. Local
pre-commit checks read them. Nothing in the repository does, and
`test-results/` is ignored.

**The hash is of content on disk, not of the last commit.** Modification times
are useless for this: `git checkout` rewrites them on files whose content never
changed, and a rule built on them cries wolf after every branch switch until
it is switched off. A commit's tree hash is wrong in the other direction: it
describes what was committed, not what was tested, so a run against
uncommitted changes records nothing that identifies them. Hashing the working
tree, using the blob id git would store for each file, is invariant under
both. Checkout does not change content and commit does not change content, so
one comparison covers both.

`head` is recorded for the report only. Nothing should be decided from it.

## Known gaps

- Service-role code paths are not covered. Those bypass access control by
  design and must filter by user id themselves, which is the likeliest place
  for a leak once serverless functions land.
- A table created with access control left off would be wide open and every
  existing assertion would still pass. Check `pg_tables.rowsecurity`
  separately.
- Fixed test email addresses, so two concurrent runs would collide.
