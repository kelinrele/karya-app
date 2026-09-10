# `openspec/`

Behaviour specifications for the rebuild, written before the code they
describe.

A specification here says what the system must do from the outside: what a
caller can observe, what it cannot, and which requests are refused. It does not
name tables, functions, or libraries. The test is simple, and worth applying
before adding anything: if the implementation could change without changing
what a user or a caller experiences, it does not belong in a spec.

That restraint is the point. Implementation notes go stale the moment the code
moves. A behaviour contract survives a rewrite, which is what makes it useful
to the migration steps that have not started yet.

## Layout

```
openspec/
├── config.yaml     project context and conventions
├── specs/          accepted specifications, filled as changes are archived
└── changes/        proposed work, one directory per change
    └── archive/    changes that have been completed and folded into specs/
```

`specs/` is empty until the first change is archived. That is expected, not an
oversight: a specification is promoted only once the behaviour it describes has
actually been built and verified.

## A change

Each directory under `changes/` holds four artifacts, and each answers a
different question.

| File | Answers |
|---|---|
| `proposal.md` | Why this change, what it covers, what it deliberately excludes |
| `specs/<capability>/spec.md` | What the system must do, as testable scenarios |
| `design.md` | How, and why each decision was made over the alternatives |
| `tasks.md` | The work, in order, each item naming how it is verified |

Scenarios use `WHEN` and `THEN`, and requirements use `SHALL`. Both are
deliberate: they force a claim precise enough to check, where "should handle
errors gracefully" would not be.

## Working with it

```bash
npx openspec list                        # active changes and task progress
npx openspec show <change>               # read a change
npx openspec validate <change> --strict  # check structure before committing
```

## Rules

1. **A spec describes behaviour, not implementation.** No table names, no
   function names, no library choices.
2. **Every requirement carries at least one scenario.** A requirement nothing
   can test is a wish.
3. **Record why, not only what.** A decision without its rationale gets
   relitigated in three months by someone who cannot tell it was deliberate.
4. **Update the artifacts when reality diverges from them.** A proposal still
   describing work as outstanding after it is finished is worse than no
   proposal, because it is confidently wrong.
5. **State what was not verified.** An artifact claiming more than was checked
   costs more than one admitting a gap.

Rule 4 has already been broken once here. The proposal for the schema change
described the database as unproven for several hours after it had been proven,
and had to be corrected. Worth knowing that it is the easiest of the five to
neglect, because nothing fails when you do.
