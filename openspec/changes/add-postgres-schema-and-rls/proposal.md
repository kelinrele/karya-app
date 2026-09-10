# Add Postgres persistence with row level security

## Why

Karya currently keeps personal tasks in browser storage and group lists in a
document store. Neither arrangement survives contact with a second device: a
user who signs in on their phone sees an empty list, because signing in changes
nothing about where personal data lives. Group lists do sync, but they store
every task of a group inside one nested array, so completing a task rewrites
the whole array and two members editing at once silently lose a write.

Step 2 of the migration replaces both with Postgres. This change defines that
schema, the access control that protects it, and the evidence that the access
control actually works.

The last part is the reason this change is not already finished. Row level
security policies are easy to write in a way that reads correctly and behaves
wrongly, and the anon key is public by design, so the policies are the only
thing standing between one user's tasks and everybody else's.

## What Changes

Already written and committed, pending verification:

- Two migrations, `0001_core_schema.sql` and `0002_groups.sql`, covering
  profiles, tasks, ideas, daily completions, groups, membership, and group
  tasks, with row level security enabled on every table in the same migration
  that creates it.
- `scripts/verify-rls.mjs`, an assertion suite that drives the API as an
  anonymous caller and as two separate users.
- `scripts/seed-dev-db.mjs`, which reseeds a local database with data
  covering the awkward cases rather than the happy path.
- `supabase/config.toml`, pinning Postgres 17 and the local port assignments.

Outstanding, and the actual work of this change:

- Replay both migrations from empty against a live Postgres instance. Neither
  has ever been executed. Syntax, constraint logic, trigger behaviour, and the
  Realtime publication are all currently unproven.
- Run the verification suite and resolve every failure. A failure is either a
  wrong policy or a wrong assertion, and which one it is must be decided
  deliberately rather than by relaxing the assertion.
- Confirm the security definer functions cannot be used to enumerate groups a
  caller does not belong to.
- Record the resulting behaviour as specifications, so later steps have a
  contract to build against rather than SQL to reread.

Not a code change so much as a promotion: written SQL becomes verified SQL.

## Capabilities

### New Capabilities

- `data-persistence`: Per-user storage of tasks, substeps, ideas, and daily
  completion history, readable and writable only by its owner, with streak
  history append-only.
- `group-collaboration`: Shared task lists with membership, redeemable join
  codes, owner-only administration, and realtime updates, where non-members
  can observe nothing at all.

### Modified Capabilities

None. There are no existing specifications; this is the first change to define
any.

## Impact

- `supabase/migrations/0001_core_schema.sql`, `0002_groups.sql`: verified,
  and corrected by a new migration if verification finds a fault. Applied
  migrations are append-only, so nothing already committed is edited in place.
- `scripts/verify-rls.mjs`, `seed-dev-db.mjs`: first real execution. Their
  own correctness is under test here as much as the schema's.
- Requires Docker and a local Supabase stack, which is being installed. Without
  a container runtime none of this is verifiable.
- Unblocks step 3, authentication, and step 4, the data layer. Both depend on
  the table shapes settled here.
- No frontend impact. Nothing in `app/` reads from Postgres yet.

## Non-goals

- **pgvector and automatic embeddings.** Deferred to step 8. The embedding
  provider fixes the vector width, and changing that later forces a table
  rewrite, so the column is deliberately not added on a guess.
- **Migrating legacy group data.** Settled: groups start fresh.
- **Guest mode storage.** Guests stay in browser storage and never reach
  Postgres. The repository interface that hides this difference is step 4.
- **Authentication flows.** This change assumes `auth.users` is populated and
  says nothing about how a user gets there.
- **Performance tuning.** Indexes are included where the access pattern is
  already known. Measuring them needs data volumes that do not exist yet.
