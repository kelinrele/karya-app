# Design

## Context

See proposal.md for motivation. The constraints that shape the approach:

- **The API key is public.** It ships inside the browser bundle by design and
  identifies the project rather than authorising access. Every access decision
  therefore has to live in the database. There is no trusted client tier to
  put a check in.
- **Guests never reach Postgres.** Guest data stays in browser storage, so the
  schema only ever serves authenticated callers. It does not need an
  anonymous-owner concept, and should not grow one.
- **Two callers exist, not one.** Ordinary requests arrive with a user session.
  Serverless functions will later arrive with a service credential that
  bypasses access control entirely. The schema must be safe under the first
  and the code must be careful under the second.
- **Migrations are append-only** once applied anywhere but a local machine.
  Corrections ship as new files.

## Goals / Non-Goals

**Goals:**

- Access control that holds even if every line of client code is hostile.
- A shape that makes the concurrent-edit bug in group tasks structurally
  impossible rather than merely unlikely.
- Constraints that reject uninterpretable data at the database, so no client
  can persist a task nobody can render.
- Evidence, in the form of assertions that run, rather than SQL that reads
  convincingly.

**Non-Goals:**

- Query performance tuning. Indexes follow known access patterns; measuring
  them needs data volumes that do not exist.
- Multi-tenant or organisation-level structures above groups.
- Soft deletes or audit trails.

## Decisions

### Enable row level security in the same migration that creates the table

**Why:** A table that exists for even one migration without protection is
readable by anyone holding the public key. Splitting creation and protection
into separate files creates a window whose width is however long the second
file takes to arrive.

**Alternative rejected:** A trailing migration that switches protection on
everywhere at once. It reads more tidily and is wrong on every deploy that
lands between the two.

### Wrap `auth.uid()` in a scalar subquery inside every policy

**Why:** Written bare, the function is evaluated once per candidate row.
Wrapped as `(select auth.uid())`, Postgres caches it as an InitPlan and calls
it once per statement. On a list query the difference is one call against one
per task.

**Failure mode avoided:** Policies that are correct but degrade as a user's
task count grows, which surfaces as unexplained slowness long after the policy
was written and reviewed.

### Keep substeps denormalised on the task row

**Why:** Substeps are always read with their parent and never queried
independently. A child table would add a join to every list read and buy
nothing, since no query filters or aggregates across substeps.

**Alternative rejected:** A `task_substeps` table. Correct by normalisation
orthodoxy, but it would need its own policies duplicating the parent's, and
every one of those is another chance to get access control wrong.

**Trade-off accepted:** Substeps cannot be queried across tasks. If that is
ever needed, this becomes a table, and that is a migration rather than a
redesign.

### Make group tasks first-class rows

**Why:** This is the correction the proposal exists for. Held as one nested
collection per group, a single completion rewrote the whole collection, so two
members acting at once lost a write with no error and no warning.

Rows remove the class of bug rather than narrowing it. Two members completing
two tasks touch two rows and cannot collide.

**Alternative rejected:** Keeping the collection and adding optimistic
concurrency. It converts silent loss into a visible conflict, which is better,
but it still makes every write contend on one object for no benefit.

### Break policy recursion with a security definer membership check

**Why:** A policy on the membership table that queries the membership table
re-enters its own policy, and Postgres raises an infinite recursion error. This
is not a subtle performance issue; the query simply fails.

A `security definer` function runs with its owner's rights, so its single
lookup is not subject to the policy, which cuts the cycle.

**Why it is safe:** It accepts a group identifier and answers only about the
calling user. It returns a boolean. It cannot enumerate groups, list members,
or be coaxed into revealing a group the caller is not in.

**Alternative rejected:** Denormalising a member list onto each group row.
That reintroduces exactly the nested-collection problem being removed from
group tasks.

### Make joining a privileged function rather than a query

**Why:** A non-member cannot read groups, so they cannot find one by its code
through an ordinary query. Something has to perform that lookup with elevated
rights.

Confining it to one function with one purpose keeps the privileged surface
small and reviewable. The function takes a code, and either joins the caller
and returns the group identifier, or returns nothing.

**Failure mode avoided:** The tempting alternative is a policy permitting
anyone to select a group when they supply its code. That leaks: codes are six
characters, so the whole space is enumerable, and such a policy turns the
database into an oracle for it.

### Express "forbidden" as an absent policy

**Why:** Completion history is append-only. Rather than writing a delete policy
that always evaluates false, no delete policy is written at all. Under row
level security an operation with no permitting policy is denied.

**Trade-off accepted:** The intent is invisible in the file unless commented,
because it is expressed by absence. The migration comments on it explicitly for
that reason, and the specification states it so the behaviour is contractual
rather than incidental.

### Let the database own completion time and schedule validity

**Why:** Completion time is derived from the completion flag, so a client that
supplies both can make them disagree, and one that backdates can corrupt streak
history. A trigger maintains it and ignores what the client sent.

Schedule validity is a constraint rather than client validation because a task
scheduled both ways at once is meaningless to every client that will ever read
it. Validating in one client leaves the next one free to write nonsense.

## Risks / Trade-offs

**Service credential bypasses everything** → Serverless functions and the
future embedding worker run with a credential that ignores row level security
entirely. Every such function must filter by user identifier in its own code.
This is the most likely place for a leak in the finished system, and no
database-level protection will catch it. It needs its own tests when step 7
lands; the current suite does not cover it.

**The schema has never executed** → Syntax, constraint logic, trigger
behaviour, and the realtime publication are all unproven. The first replay may
simply fail. This is precisely why the change is not already closed.

**The verification suite is itself unproven** → It has never run either. A pass
on the first attempt should be treated with mild suspicion until at least one
assertion has been seen to fail correctly, for instance by temporarily
loosening a policy.

**Absent protection is invisible to the suite** → The assertions check the
policies that exist. A table created later with protection left off would be
wide open and every existing assertion would still pass. A separate check that
enumerates tables lacking row level security covers this, and is a task.

**Fixed test identities** → The suite uses fixed email addresses, so two
concurrent runs would collide. Acceptable for local use, and worth revisiting
if this ever runs in continuous integration.

**Realtime respects policies, but this is assumed** → Delivery is expected to
be filtered by membership. That expectation is stated in the specification and
must be checked rather than trusted, because a leak here bypasses the careful
work everywhere else.

## Migration Plan

1. Start the local stack, which requires a container runtime.
2. Replay both migrations from empty. Not against an existing database: a
   migration that only works against the current state is broken.
3. Seed data covering the awkward cases.
4. Run the assertion suite and resolve every failure.
5. Correct faults in a new migration, never by editing an applied one.

**Rollback:** Nothing is deployed and no data exists, so rollback is resetting
the local database. This is the last point in the migration at which that is
true, which is an argument for getting the shape right now.

## Open Questions

- Whether group join codes should expire or be regenerable. Neither changes the
  schema shape, since a code is already a mutable column, and neither affects
  the specifications above.
- Whether an owner leaving should transfer ownership or delete the group.
  Currently the account cascade deletes it. This needs a product decision
  before groups ship in step 6, but not before the schema is verified.
