/// <reference types="vite/client" />

// The variables the browser bundle is allowed to read. Anything without the
// VITE_ prefix never reaches the client, which is the point of the prefix:
// service keys and model keys stay on the server side of that line.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
