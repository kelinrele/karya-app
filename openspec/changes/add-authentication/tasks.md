# Tasks

Unlike the previous change, none of this is written yet. These are authoring
tasks, and the verification named on each is what decides whether one is
genuinely done rather than merely typed.

Two tasks are called out early because they are pre-existing faults rather than
new work: the redirect configuration points at a port nothing serves, and the
profile trigger has never been asserted by anything. Both were found while
planning this change, not while running it.

One task is blocked by something outside this repository. Google OAuth needs a
Google Cloud OAuth client that only the repository owner can create, so the
email and password path is sequenced first and the session layer is proved
without waiting on it.

## 1. Client and configuration

- [ ] 1.1 Add `@supabase/supabase-js` to `app/package.json`, verified by
      `npm ls @supabase/supabase-js` in `app/` resolving it and the type check
      still passing. It is already used by `scripts/verify-realtime.mjs`, so
      the library is not new to the project, only to the front end
- [ ] 1.2 Add `app/.env.example` naming the API URL and publishable key with
      empty values, verified by the file listing the key names and no key
      material. The real `.env` stays untracked
- [ ] 1.3 Create the client as a single module-level instance, verified by a
      grep showing exactly one `createClient` call in `app/src`. Two clients
      each install an auth listener and each hold a refresh timer over the same
      stored session, and the resulting intermittent unauthorised response
      disappears on reload, which makes it nearly undiagnosable

## 2. Reconcile the local auth configuration

- [ ] 2.1 Correct the redirect ports in `supabase/config.toml`, verified by
      `site_url` and `additional_redirect_urls` naming port 5173 and by
      `npx supabase status` reporting the stack healthy after a restart.
      They currently read `http://127.0.0.1:3000` and `https://127.0.0.1:3000`
      while Vite serves on 5173, so an OAuth redirect would return the browser
      to a port with nothing listening. The second entry is wrong twice over:
      the local dev server speaks http, not https. Nothing has failed yet only
      because nothing has attempted a redirect. The first attempt will present
      as a provider misconfiguration, which is a poor thing to debug at the
      same moment as a newly created OAuth client, and the fix is one line
- [ ] 2.2 Confirm anonymous sign-ins stay disabled, verified by
      `enable_anonymous_sign_ins = false` in `config.toml` and by an assertion
      in `scripts/verify-auth.mjs` that the anonymous sign-in endpoint refuses
      and creates no user. Guest mode is browser storage; the schema has no
      anonymous-owner concept and must not grow one. A default that nothing
      checks is a default that drifts

## 3. Prove the profile trigger

- [ ] 3.1 Assert that creating a user creates a profile, verified by
      `node scripts/verify-auth.mjs` reading `public.profiles` after a sign-up
      and finding exactly one row whose id matches the new user.
      **Nothing asserts this today.** `handle_new_user` and
      `on_auth_user_created` are in `0001` and read correctly, but the only
      profile assertion in any existing suite checks that a profile is
      *removed* when the account is deleted, and that passes identically
      whether a profile was created and then cascaded away or was never
      created at all. Step 3 is where the assumption starts to matter, because
      every signed-in user is expected to have a profile row from here on
- [ ] 3.2 Confirm the display name falls back correctly, verified by
      `node scripts/verify-auth.mjs` covering all three branches of the
      `coalesce`: a user with `full_name` metadata, a user with `name` and no
      `full_name`, and a user with neither, whose display name must become the
      local part of the email address. A fallback chain where only the first
      branch is ever exercised is three untested branches wearing one test
- [ ] 3.3 Confirm a client cannot manufacture a profile it does not own,
      verified by `node scripts/verify-auth.mjs` attempting an insert into
      `profiles` naming another user's id and observing a refusal. `profiles`
      deliberately carries no insert policy, since the trigger is
      `security definer` and needs none, so this asserts that an absence is
      doing its job
- [ ] 3.4 **Only if 3.1 or 3.2 fails**, correct the trigger in the next
      migration in sequence, verified by a clean `npx supabase db reset`
      followed by the full suite passing. Prove the behaviour before changing
      anything. During the previous change a migration was written on a
      diagnosis that felt obvious, was never tested before being acted on, and
      was wrong; a mutation test caught it because reverting it broke nothing,
      and it was discarded before it was ever committed. The trigger here may
      well be correct, and correct-looking is precisely the state `0004`'s
      trigger was in before it was run

## 4. Email and password sign-in

- [ ] 4.1 Implement sign-up, sign-in, and sign-out against the local stack,
      verified by `node scripts/verify-auth.mjs` completing a full round trip
      and by the created user appearing in `auth.users`
- [ ] 4.2 Restore an existing session on load, verified by an assertion that a
      session persisted to storage is recognised by a freshly constructed
      client without credentials being presented again
- [ ] 4.3 Expose the current user to the application without any component
      reading storage directly, verified by a grep finding no direct access to
      the session storage key outside the client module. Step 4 chooses a
      repository implementation from this value, so it needs one source
- [ ] 4.4 Confirm sign-out ends access rather than hiding it, verified by
      `node scripts/verify-auth.mjs` replaying a token captured before
      sign-out and receiving no records. Clearing the user from application
      state while a usable token survives looks identical in the interface and
      is not the same thing

## 5. Google OAuth

- [ ] 5.1 **Externally blocked.** Create a Google Cloud OAuth client and record
      its id and secret in the untracked local environment, verified by
      `npx supabase status` starting with the provider enabled. Only the
      repository owner can do this, which is why it does not gate tasks 1
      through 4
- [ ] 5.2 Enable the provider in `config.toml`, reading the credentials from
      the environment rather than literals, verified by the file containing no
      key material and the stack starting
- [ ] 5.3 Confirm the redirect target matches the dev server, verified by the
      configured redirect resolving to the 5173 origin fixed in 2.1. The round
      trip itself needs a browser and a person; a script can prove the
      configuration is coherent, not that Google accepts it
- [ ] 5.4 Confirm a Google-created user gets a profile carrying the provider's
      name, verified by 3.2's `full_name` branch, which is the same code path.
      No separate assertion is needed, and adding one would imply otherwise

## 6. Prove it, and record

- [ ] 6.1 Write `scripts/verify-auth.mjs` in the established shape, verified by
      it refusing to run against a non-local target and writing a receipt to
      `test-results/` on exit like the other three suites
- [ ] 6.2 Pair every negative assertion with a positive control, verified by
      review of the suite: each "no records returned" is accompanied by a
      request that must succeed. Otherwise a broken request and a correct
      refusal are indistinguishable, which is the trap both the delete
      assertion and the realtime test fell into in step 2
- [ ] 6.3 Confirm the suite can fail, verified by a mutation: disable the
      profile trigger, observe the profile assertions fail and nothing else,
      then restore. A mutation that breaks nothing is a finding, not a
      nuisance
- [ ] 6.4 Run all four suites from an empty database, verified by
      `npx supabase db reset` followed by each suite passing, so the port
      change in 2.1 is proved not to have disturbed anything else
- [ ] 6.5 Mark step 3 complete in the migration plan, verified by the plan
      naming step 4 as the next unfinished step
- [ ] 6.6 Run `npx openspec validate add-authentication --strict`, verified by
      it reporting no errors
- [ ] 6.7 Commit with explicit paths, verified by `git status --short` listing
      only the intended files, with no `.env` and no local tooling in the index
