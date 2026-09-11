# Add authentication

## Why

The previous change built a schema whose access control rests entirely on
`auth.uid()`. Nothing in the application populates it. Every policy verified in
step 2 was driven by users minted through the admin API and signed in by a test
script, which proves the policies work but says nothing about how a person
obtains a session in a browser.

The live app still signs in through Firebase Auth. Until that is replaced,
Postgres is a database no user can reach and Firebase cannot be removed, so
both step 4, the data layer, and step 6, groups on realtime, stay blocked.

This change is the plumbing beneath sign-in, not the screen on top of it. The
authentication screen belongs to step 5 with the rest of the interface. What is
needed first is a client, a session that survives a reload, and evidence that
signing out actually ends access rather than merely hiding it.

Two things about this step were wrong in the plan before any code was written,
and both are corrected here rather than discovered later.

**Anonymous sessions were never wanted.** An early draft of step 3 read "Google
OAuth plus anonymous sessions". That contradicts the locked decision that guest
mode is browser storage, the design note that the schema "does not need an
anonymous-owner concept, and should not grow one", and `config.toml`, which
already disables them. Three sources against one. A guest never obtains a
session and never reaches Postgres.

**The redirect configuration points at the wrong port.** `config.toml` sends
authentication back to port 3000 while Vite serves on 5173, so any redirect
would return the browser to nothing.

## What Changes

Nothing here exists yet. These are authoring tasks, unlike the previous change,
which was verification of work already written.

- **`@supabase/supabase-js` in `app/`**, which currently declares React and
  nothing else. The same library the realtime suite already uses, so its
  behaviour is not new to this project.
- **A single client module**, created once and shared, rather than a client
  constructed per call site. Two clients mean two session listeners and a
  race over which one wins a token refresh.
- **Session handling**: restore on load, react to token refresh, expose the
  current user to the application without any component reading storage
  directly.
- **Email and password sign-in first.** It works against the local stack with
  no external setup, which means the session layer can be built and proved
  today rather than after an external dependency clears.
- **Google OAuth on top of it.** The session handling is identical whichever
  method produced the session, so sequencing email first wastes nothing.
- **`scripts/verify-auth.mjs`**, in the established shape: every negative
  assertion paired with a positive control, because "nothing came back" and
  "the request never worked" are otherwise indistinguishable.
- **The redirect ports reconciled** to 5173.
- **The profile auto-creation trigger asserted.** It exists in `0001` and has
  never been checked.

## Capabilities

### New Capabilities

- `authentication`: Obtaining, holding, and ending a session, and the profile
  record that every authenticated user is expected to have. Includes the
  guarantee that a guest never obtains a session at all.

### Modified Capabilities

None. `data-persistence` and `group-collaboration` describe what a session may
do once it exists and say nothing about how it is acquired, so neither needs
amending. Profiles are unmentioned in both, which is why the profile
requirement lands here rather than as a modification.

## Impact

- `app/package.json`, `app/src/`: first dependency beyond React, and the first
  module that talks to a backend.
- `supabase/config.toml`: redirect URLs corrected. No behavioural change to the
  database itself.
- `scripts/verify-auth.mjs`: new suite, writing a receipt like the others.
- Possibly a migration, but only if asserting the profile trigger shows one is
  needed. Written before that is known, it would be a guess.
- **Externally blocked in part.** Google OAuth needs a Google Cloud OAuth
  client, which only the repository owner can create. Email and password sign-in
  has no such dependency, so the block delays one task rather than the change.
- Unblocks step 4, the data layer, which chooses an implementation based on
  whether a session exists.

## Non-goals

- **The authentication screen.** Step 5 owns the interface. Building it here
  would mean writing a screen against a session layer being written at the same
  time.
- **Migrating Firebase accounts.** Groups start fresh, and personal data lives
  in browser storage today, so there is no account history worth carrying. A
  user signs up again.
- **Promoting guest data on first sign-in.** That importer is step 4, where the
  repository interface it writes through exists.
- **Anonymous sessions.** Declined deliberately, see above.
- **Deleting Firebase.** Step 6. Groups still use it until then.
- **Password reset, email confirmation, and multi-factor.** Local development
  runs with confirmations off. Each is a production concern that needs a mail
  sender, and none blocks the data layer.
