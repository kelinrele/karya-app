/**
 * The one Supabase client.
 *
 * Created once at module load and shared by import. Two clients would each
 * install an auth listener and each hold a refresh timer over the same
 * stored session; when one rotates the token the other is left holding a
 * stale one, and the symptom is an intermittent unauthorised response that
 * disappears on reload. Nearly undiagnosable from a bug report, so it is
 * prevented structurally: this is the only `createClient` in the tree.
 *
 * Reads the Vite-exposed variables only. `process.env` does not exist in
 * the browser and must never be reached for here.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both in.',
  );
}

export const supabase = createClient(url, anonKey);
