# `app/src/lib/`

Clients, the data layer, and pure helpers. Nothing here renders anything.

## Current contents

| File | Role |
|---|---|
| `supabase.ts` | The one Supabase client, created at module load from the `VITE_` variables. Throws at import if either is missing. |
| `auth.ts` | Sign-up, sign-in, sign-out, session read, and session subscription. The only module that touches auth. |

## Rules

1. **One client.** `supabase.ts` holds the only `createClient` call in the
   tree. A second client installs a second auth listener and a second refresh
   timer over the same stored session, and the two race over token rotation.
   The failure is an intermittent unauthorised response that disappears on
   reload, which is nearly undiagnosable from a report.
2. **Auth goes through `auth.ts`.** No other module imports the client for
   auth, and no other module reads the session from storage. When the way a
   session is held has to change, it changes in one file.
3. **Guest mode is not an auth state.** A guest has no session at all. The
   data layer will choose between the guest and signed-in backends from what
   `auth.ts` reports; components never branch on it.
4. **`import.meta.env` only.** This is a Vite app. `process.env` does not
   exist in the browser, and only `VITE_`-prefixed names reach the bundle,
   which is what keeps the service key and the model key out of it.
