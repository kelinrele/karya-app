# `scripts/`

Development scripts for the local Supabase stack. Not part of the shipped
application; nothing here runs in production.

Plain Node with **zero dependencies**. Everything talks to PostgREST and the
auth API over `fetch` rather than pulling in a client library, so the directory
needs no install step of its own. Node 20 or newer.

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

## Known gaps

- Service-role code paths are not covered. Those bypass access control by
  design and must filter by user id themselves, which is the likeliest place
  for a leak once serverless functions land.
- A table created with access control left off would be wide open and every
  existing assertion would still pass. Check `pg_tables.rowsecurity`
  separately.
- Fixed test email addresses, so two concurrent runs would collide.
