# Design

## Guest mode is browser storage, not anonymous authentication

Supabase offers anonymous sign-in, which mints a real user row and a real
session for someone who has not identified themselves. It is the obvious way to
implement a guest, and it is the wrong one here.

Anonymous sessions would put guest rows in the same tables as real ones,
distinguished only by a flag on the user record. Every policy would then need
to care about the difference, every cleanup routine would need to find and
remove abandoned anonymous accounts, and the account-deletion cascade proved in
step 2 would acquire a second meaning. The schema has no anonymous-owner
concept, and the reason to keep it that way is that adding one is cheap and
removing one is not.

The failure mode being avoided is a guest whose data is half-migrated: some in
Postgres under an anonymous identity, some in browser storage, with the
importer at step 4 having to reconcile both. Keeping guests entirely in the
browser leaves exactly one source to promote on first sign-in.

`enable_anonymous_sign_ins` is already `false`. The suite asserts it stays that
way, because a default that nothing checks is a default that drifts.

## Email and password before Google

Google OAuth is the intended sign-in method and email and password is not
expected to survive as a user-facing option. Sequencing the disposable one
first looks like waste.

It is not, because the session layer is the actual deliverable and it is
identical either way. Both methods end in the same place: a session in storage,
a refresh timer, and a user identifier the policies read. Only the first step
differs, and it is the smallest part.

What sequencing buys is that the whole of this change can be built and proved
against a local stack today. Google OAuth needs a Google Cloud OAuth client
that only the repository owner can create. Making that the first task would
stall everything behind an external dependency, and the temptation then is to
write the session layer untested and assert it works.

A redirect flow cannot be driven headlessly by an assertion script anyway. What
a suite can prove about Google sign-in is that the provider is configured and
the redirect target is right; the round trip needs a person and a browser. The
email path, by contrast, is fully scriptable, so building it first is what
makes the session layer testable at all.

## One client, created once

A module-level client, imported wherever it is needed, rather than constructed
per call site.

Two clients each install their own auth state listener and each hold their own
refresh timer against the same stored session. When one refreshes, the other is
holding a token that has just been rotated. The symptom is an intermittent
unauthorised response that disappears on reload, which is close to
undiagnosable from a bug report.

## Profile creation stays in the database

`handle_new_user` fires on insert into `auth.users` and writes the profile row.
The alternative is for the client to create its own profile after signing up.

The trigger is correct because profile creation must happen for every user, and
the client cannot be relied on to be present when the user is created. A Google
sign-in redirect that fails on the way back has still created the user. A user
created through the admin API, as every test in this project does, never runs
client code at all. Anything that must hold for all users belongs where all
users pass.

This has a consequence worth stating: `profiles` deliberately has no insert
policy. The trigger is `security definer` and bypasses row level security, so
no client-side insert path is needed, and not having one means a client cannot
manufacture a profile for an id it does not own.

## The trigger is asserted before it is trusted

Nothing in any suite checks that a profile is created. The only profile
assertion checks that one is *removed* when an account is deleted, which passes
identically whether a profile was created and cascaded away or never existed.

So the task is to assert creation first and change nothing until the assertion
has run. That order is not pedantry. During the previous change a migration
was written on a diagnosis that felt obvious, was never tested before being
acted on, and turned out to be wrong. A mutation test caught it, by noticing
that reverting it broke nothing, and it was discarded before it was ever
committed, which is why the history holds no trace of it. The rule that came
out of that was to prove the behaviour before writing the fix, and this is
the first occasion to apply it.

The trigger may well be correct. `on conflict (id) do nothing` makes it
idempotent, and the display-name fallback chain covers the two metadata shapes
Google returns plus an email localpart. Correct-looking is the same state
`0004`'s trigger was in before it was run.

## The auth screen belongs to step 5

This change produces no interface. Sign-in is exercised by a script.

Splitting it this way means the session layer is finished and proved before a
screen depends on it. The alternative is building both at once, where a failure
to stay signed in could be the session layer or the component reading it, and
the two are hard to separate while both are new.

## Redirect ports

`site_url` is `http://127.0.0.1:3000` and `additional_redirect_urls` is
`["https://127.0.0.1:3000"]`. Vite serves on 5173, and the local dev server
speaks http, so the second entry is wrong in two ways at once.

Nothing has failed yet because nothing has attempted a redirect. The first
attempt will land on a closed port and present as a provider misconfiguration,
which is a bad thing to debug while also debugging a new OAuth client. Fixing
it now costs one line.
