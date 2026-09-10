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

Written and committed before verification:

- Two migrations, `0001_core_schema.sql` and `0002_groups.sql`, covering
  profiles, tasks, ideas, daily completions, groups, membership, and group
  tasks, with row level security enabled on every table in the same migration
  that creates it.
- `scripts/verify-rls.mjs`, an assertion suite that drives the API as an
  anonymous caller and as two separate users.
- `scripts/seed-dev-db.mjs`, which reseeds a local database with data
  covering the awkward cases rather than the happy path.
- `supabase/config.toml`, pinning Postgres 17 and the local port assignments.

Since verified, with the outcome:

- **All three migrations replay cleanly from empty.** Seven tables, twenty-two
  policies, six functions, two enum types, and the realtime publication all
  create as intended, with no table left unprotected.
- **The verification suite passes 24 of 24**, driving the API as an anonymous
  caller and as two separate users.
- **It found one real fault**, corrected in
  `0003_fix_group_insert_returning.sql`. The groups select policy hid a newly
  created group from its own creator, because `RETURNING` is evaluated before
  the `AFTER INSERT` trigger that records the owner's membership. A plain
  `INSERT` succeeded while `INSERT ... RETURNING` was refused, which isolated
  it. This would have broken the client library, which calls
  `.insert().select()` by default.
- **It also found one wrong assertion.** A DELETE blocked by a policy returns
  success with zero rows rather than a refusal, so the test expected the wrong
  failure shape. Corrected in the test, not the policy.
- The security definer functions were confirmed unable to enumerate groups the
  caller does not belong to.

Two genuine failures for two different reasons is better evidence the suite
works than the artificial check originally planned for it.

Not a code change so much as a promotion: written SQL became verified SQL.

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

- `supabase/migrations/0001_core_schema.sql`, `0002_groups.sql`: verified as
  written, neither edited. `0003_fix_group_insert_returning.sql` adds the one
  correction verification found. Applied migrations are append-only, so nothing
  already committed was edited in place.
- `scripts/verify-rls.mjs`, `seed-dev-db.mjs`: first real execution. Their
  own correctness is under test here as much as the schema's.
- Requires Docker and a local Supabase stack, both now running. Without a
  container runtime none of this is verifiable.
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
