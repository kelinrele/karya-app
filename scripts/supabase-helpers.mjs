/**
 * Shared helpers for the local Supabase scripts. Zero dependencies.
 *
 * Everything talks to PostgREST and GoTrue over plain fetch rather than
 * pulling in @supabase/supabase-js, which keeps this directory install-free.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/ sits directly under the repository root, so one level up.
export const ROOT = resolve(HERE, '..');

/** Parse a .env file into a plain object. Ignores comments and blank lines. */
function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Resolve configuration from app/.env, then the real environment, which wins.
 * Accepts both the VITE_ prefixed names and the bare ones.
 */
export function loadConfig() {
  const fileEnv = parseEnv(resolve(ROOT, 'app', '.env'));
  const env = { ...fileEnv, ...process.env };

  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '';
  const anonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  return { url: url.replace(/\/+$/, ''), anonKey, serviceKey };
}

/** True when the URL points at a local Supabase stack. */
export function isLocal(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(url);
}

/**
 * Guard for anything destructive. A seed script that silently wipes a
 * production project is the worst possible outcome, so remote targets are
 * refused unless the operator opts in explicitly.
 */
export function assertSafeTarget(url, args) {
  if (isLocal(url)) return;
  if (args.has('--allow-remote')) {
    console.warn(`WARNING: running against a remote target: ${url}`);
    return;
  }
  console.error(
    `Refusing to run against a non-local target: ${url || '(unset)'}\n` +
      `This script deletes rows. Pass --allow-remote only if you are certain.`,
  );
  process.exit(2);
}

/** A PostgREST request. `token` may be a service key or a user JWT. */
export async function rest(cfg, path, { method = 'GET', token, body, prefer, apikey } = {}) {
  const headers = {
    apikey: apikey ?? cfg.anonKey,
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
}

/** Call a Postgres function exposed through PostgREST. */
export function rpc(cfg, fn, args, opts = {}) {
  return rest(cfg, `rpc/${fn}`, { method: 'POST', body: args, ...opts });
}

/** Create a confirmed user with the admin API, or return the existing one. */
export async function ensureUser(cfg, email, password) {
  const create = await fetch(`${cfg.url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (create.ok) {
    const user = await create.json();
    return { id: user.id, email, password, created: true };
  }

  // Already registered is fine; find the id so the caller can carry on.
  const list = await fetch(
    `${cfg.url}/auth/v1/admin/users?per_page=200`,
    { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` } },
  );
  if (!list.ok) {
    throw new Error(`Cannot create or list users: ${create.status} ${await create.text()}`);
  }
  const { users = [] } = await list.json();
  const found = users.find((u) => u.email === email);
  if (!found) throw new Error(`User ${email} could not be created or found.`);
  return { id: found.id, email, password, created: false };
}

/** Exchange email and password for an access token. */
export async function signIn(cfg, email, password) {
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

/** Delete a user outright. Cascades remove all their rows. */
export async function deleteUser(cfg, id) {
  await fetch(`${cfg.url}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
  });
}

/** Fail fast with a readable message when configuration is missing. */
export function requireConfig(cfg, needs = ['url', 'anonKey', 'serviceKey']) {
  const missing = needs.filter((k) => !cfg[k]);
  if (missing.length === 0) return;
  const names = {
    url: 'SUPABASE_URL or VITE_SUPABASE_URL',
    anonKey: 'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY',
    serviceKey: 'SUPABASE_SERVICE_ROLE_KEY',
  };
  console.error(
    `Missing configuration:\n${missing.map((m) => `  - ${names[m]}`).join('\n')}\n\n` +
      `Set them in app/.env or the environment. Run "supabase start" for local values.`,
  );
  process.exit(2);
}
