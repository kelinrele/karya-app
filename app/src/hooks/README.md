# `app/src/hooks/`

Shared React hooks. A hook lives here only when more than one feature needs
it; a hook used by one screen lives with that screen.

## Current contents

| File | Role |
|---|---|
| `useSession.ts` | The current session, kept current, with `isLoading` true until storage has answered. |

## The `isLoading` contract

Restoring a session is asynchronous. On a hard refresh there is a moment
where the session is **unknown**, not absent. `useSession` reports
`isLoading: true` for that moment and `session: null` alongside it, and
nothing should act on `session` until `isLoading` is false.

Treating unknown as absent has two costs. The visible one is a flash of the
signed-out state on every reload. The expensive one is that a data layer
choosing a backend from `session` would pick the guest store for a signed-in
user, read the wrong data, and possibly write to it.

Ended by whichever answers first: the subscription's initial event or a
direct session read. Both report the same session, so order does not matter.
