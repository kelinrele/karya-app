# Migrations

Ordered SQL applied by `supabase db reset` and by `supabase db push`.

## Naming

`NNNN_short_snake_case_description.sql`, numbered sequentially. The number sets
the order, so it must never be reused or reordered once a migration has been
applied anywhere other than a local machine.

## Current migrations

| File | Contents |
|---|---|
| `0001_core_schema.sql` | Profiles, tasks, ideas, daily completions, plus their policies and triggers. |
| `0002_groups.sql` | Groups, membership, group tasks, the join RPC, and Realtime publication. |

## Rules

1. **Migrations are append-only.** Once applied outside a local machine, a file
   is frozen. Corrections go in a new migration, never as an edit to an old
   one. Editing history leaves environments silently diverged.
2. **Enable Row Level Security in the same file that creates the table.** Not
   in a later migration. The gap between the two is a window where the table is
   world-readable.
3. **Every table referencing a user cascades on delete.** Deleting a user must
   remove their data, and this is also what makes a full local wipe possible.
4. **Prefer a constraint to application validation** when the rule is about
   data rather than about the interface. `tasks_schedule_shape` is a good
   example: a task scheduled both ways at once is meaningless in any client, so
   the database refuses it.
5. **Comment the non-obvious.** A reader six months from now needs to know why
   `is_group_member` is `security definer`, not that it checks membership.
6. **Reset before committing.** `supabase db reset` replays everything from
   empty. A migration that only works against your current database is broken.

## Planned

`0003` will add pgvector, the embedding columns on tasks and ideas, the
enqueueing trigger, and the job queue table. It is deliberately not written yet,
since the embedding provider fixes the vector width and changing that later
forces a table rewrite.
