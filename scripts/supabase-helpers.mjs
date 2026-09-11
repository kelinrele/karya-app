/**
 * Shared helpers for the local Supabase scripts. Zero dependencies.
 *
 * Everything talks to PostgREST and GoTrue over plain fetch rather than
 * pulling in @supabase/supabase-js. Only verify-realtime.mjs needs a package;
 * the rest run on bare Node.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** Never throws; a suite must not fail because bookkeeping did. */
function git(cmd, input) {
  try {
    return execSync(`git ${cmd}`, {
      cwd: ROOT,
      encoding: 'utf8',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** The paths a verification run is understood to have exercised. */
export const RECEIPT_PATHS = ['supabase/migrations', 'scripts'];

/**
 * A hash of what is on disk under each path, right now.
 *
 * Deliberately not the tree hash of HEAD. That describes the last commit, not
 * the content a run was tested against: a run against uncommitted changes
 * would record nothing identifying those changes, and once they were committed
 * the receipt could neither match nor mismatch them.
 *
 * Content on disk is unchanged by `git checkout`, which only rewrites
 * timestamps, and by `git commit`, which only moves HEAD. So one comparison
 * against this covers both, with no fallback to modification times.
 *
 * Each file's blob id is what git would store for its current content,
 * filters applied, so a clean file hashes to exactly what HEAD holds.
 */
export function contentHash(paths = RECEIPT_PATHS) {
  const out = {};
  for (const path of paths) {
    const listed = git(`ls-files --cached --others --exclude-standard -- ${path}`);
    if (listed === null) {
      out[path] = null;
      continue;
    }
    const files = listed
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f && existsSync(resolve(ROOT, f)))
      .sort();
    if (files.length === 0) {
      out[path] = null;
      continue;
    }
    const blobs = git('hash-object --stdin-paths', files.join('\n') + '\n');
    if (blobs === null) {
      out[path] = null;
      continue;
    }
    const ids = blobs.split('\n');
    const lines = files.map((f, i) => `${ids[i]} ${f}`);
    out[path] = createHash('sha1').update(lines.join('\n')).digest('hex');
  }
  return out;
}

/**
 * Record the outcome of a verification run to test-results/.
 *
 * The receipt identifies the content that was tested, via `contentHash`, so a
 * reader can tell whether a passing run still speaks for what is on disk.
 * `head` is informational only; nothing should be decided from it.
 */
export function writeReceipt({ script, exitCode, passed, total }) {
  const receipt = {
    script,
    exitCode,
    passed,
    total,
    at: new Date().toISOString(),
    head: git('rev-parse HEAD'),
    content: contentHash(),
  };

  try {
    const dir = resolve(ROOT, 'test-results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${script}.json`), JSON.stringify(receipt, null, 2) + '\n');
  } catch {
    // A suite must never fail because bookkeeping failed. The receipt being
    // absent is itself the signal that the run cannot be vouched for.
  }
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
