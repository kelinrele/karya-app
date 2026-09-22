#!/usr/bin/env node
/**
 * verify-auth
 *
 * Empirically checks what a session is, how one is obtained, what ends it,
 * and what every authenticated user is guaranteed to have. Every assertion is
 * a real request against the running stack, not a reading of the config.
 *
 * Users are created through the public sign-up endpoint rather than the admin
 * API, because the profile trigger and its display-name fallbacks are part of
 * what is under test and the admin path does not exercise sign-up metadata
 * the way a client does.
 *
 * Every negative assertion sits beside a positive control. "Nothing came
 * back" and "the request never worked" are otherwise indistinguishable.
 *
 * Requires `npm install` at the repository root for @supabase/supabase-js,
 * which the session-persistence checks need for its storage behaviour. The
 * rest uses plain fetch.
 *
 * Usage:
 *   node scripts/verify-auth.mjs
 *   node scripts/verify-auth.mjs --keep     leave the test users behind
 *   node scripts/verify-auth.mjs --allow-remote
 *
 * See scripts/README.md for the full contract.
 */

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  loadConfig,
  requireConfig,
  assertSafeTarget,
  rest,
  deleteUser,
  writeReceipt,
} from './supabase-helpers.mjs';

const args = new Set(process.argv.slice(2));
const KEEP = args.has('--keep');

const cfg = loadConfig();
requireConfig(cfg);
assertSafeTarget(cfg.url, args);

const PASSWORD = 'karya-auth-password';
const USERS = {
  full: { email: 'auth-full@karya.test', data: { full_name: 'Full Name Person' } },
  name: { email: 'auth-name@karya.test', data: { name: 'Name Only' } },
  plain: { email: 'auth-plain@karya.test', data: {} },
};

// The access-token lifetime this suite expects, mirroring jwt_expiry in
// supabase/config.toml. It is a literal, not read from that file: the point
// is that changing the lifetime there makes this fail with the new number,
// so the reasoning about the sign-out exception gets revisited.
const JWT_EXPIRY_SECONDS = 3600;

// The local stack signs tokens with HS256 over this published development
// default unless overridden. It is used here to mint a deliberately expired
// token and prove the API refuses it. This is only meaningful because the
// script refuses to run against anything but a local target.
const LOCAL_DEFAULT_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const JWT_SECRET = cfg.jwtSecret || LOCAL_DEFAULT_JWT_SECRET;

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
}

function expectDenied(name, res) {
  const denied =
    res.status === 401 ||
    res.status === 403 ||
    (res.body && typeof res.body === 'object' && res.body.code === '42501');
  record(name, denied, `expected a denial, got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectEmpty(name, res) {
  const empty = res.ok && Array.isArray(res.body) && res.body.length === 0;
  record(name, empty, `expected 0 rows, got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectRows(name, res, min = 1) {
  const enough = res.ok && Array.isArray(res.body) && res.body.length >= min;
  record(name, enough, `expected at least ${min} row(s), got ${res.status} ${JSON.stringify(res.body)}`);
}

/** A GoTrue request. Returns { status, ok, body } like rest(). */
async function auth(path, { method = 'POST', body, token } = {}) {
  const headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
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

/** Admin listing, for the pre-clean and for counting users. */
async function listUsers() {
  const res = await fetch(`${cfg.url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
  });
  if (!res.ok) throw new Error(`Cannot list users: ${res.status}`);
  const { users = [] } = await res.json();
  return users;
}

/** Remove any test user a crashed earlier run left behind. */
async function preClean() {
  const emails = new Set(Object.values(USERS).map((u) => u.email));
  for (const u of await listUsers()) {
    if (emails.has(u.email)) await deleteUser(cfg, u.id);
  }
}

/** Sign up through the public endpoint, as a client would. */
async function signUp({ email, data }) {
  const res = await auth('signup', { body: { email, password: PASSWORD, data } });
  if (!res.ok || !res.body?.access_token) {
    throw new Error(`Sign-up failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    id: res.body.user.id,
    email,
    accessToken: res.body.access_token,
    refreshToken: res.body.refresh_token,
  };
}

function claims(jwt) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
}

/** Sign a payload the way the local stack does, so expiry can be forged. */
function signHs256(payload, secret) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** In-memory storage in the shape supabase-js expects, one Map per adapter. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function clientOver(storage) {
  return createClient(cfg.url, cfg.anonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function main() {
  console.log(`Target: ${cfg.url}\n`);
  await preClean();

  // ---------------------------------------------- anonymous sign-in is off
  console.log('-- anonymous sign-in must be disabled --');
  const before = (await listUsers()).length;
  // Pinned to the exact refusal, not to "any failure". A service that is down
  // also fails to hand out a session, and that must not read as a pass.
  const anon = await auth('signup', { body: {} });
  record(
    'a sign-up with no identity is refused because anonymous sign-in is disabled',
    anon.status === 422 && anon.body?.error_code === 'anonymous_provider_disabled',
    `expected 422 anonymous_provider_disabled, got ${anon.status} ${JSON.stringify(anon.body)}`,
  );
  record(
    'and it created no user',
    (await listUsers()).length === before,
    'the user count changed',
  );

  const full = await signUp(USERS.full);
  record('control: a sign-up with an email returns a session', Boolean(full.accessToken));
  const name = await signUp(USERS.name);
  const plain = await signUp(USERS.plain);

  // ------------------------------------------- the public key alone grants nothing
  console.log('\n-- the public key alone grants nothing --');
  const seeded = await rest(cfg, 'tasks', {
    method: 'POST',
    body: { user_id: full.id, text: 'A private task' },
    prefer: 'return=representation',
    token: full.accessToken,
  });
  record('setup: the signed-in user can create a task', seeded.ok, JSON.stringify(seeded.body));
  expectEmpty('the public key with no session sees no tasks', await rest(cfg, 'tasks?select=id'));
  expectRows(
    'control: the same request with a session sees that user\'s task',
    await rest(cfg, 'tasks?select=id', { token: full.accessToken }),
  );

  // ------------------------------------------ every authenticated user has a profile
  console.log('\n-- every authenticated user has a profile --');
  const profileOf = (u) =>
    rest(cfg, `profiles?id=eq.${u.id}&select=id,display_name`, { token: u.accessToken });

  const pFull = await profileOf(full);
  record(
    'sign-up creates exactly one profile',
    pFull.ok && Array.isArray(pFull.body) && pFull.body.length === 1,
    `got ${pFull.status} ${JSON.stringify(pFull.body)}`,
  );
  record(
    'full_name in sign-up metadata becomes the display name',
    pFull.body?.[0]?.display_name === USERS.full.data.full_name,
    `got ${JSON.stringify(pFull.body?.[0]?.display_name)}`,
  );
  const pName = await profileOf(name);
  record(
    'name alone in sign-up metadata becomes the display name',
    pName.body?.[0]?.display_name === USERS.name.data.name,
    `got ${JSON.stringify(pName.body?.[0]?.display_name)}`,
  );
  const pPlain = await profileOf(plain);
  record(
    'no metadata at all falls back to the email local part',
    pPlain.body?.[0]?.display_name === USERS.plain.email.split('@')[0],
    `got ${JSON.stringify(pPlain.body?.[0]?.display_name)}`,
  );

  expectDenied(
    'a user cannot insert a profile carrying another user\'s id',
    await rest(cfg, 'profiles', {
      method: 'POST',
      body: { id: name.id, display_name: 'forged' },
      token: full.accessToken,
    }),
  );
  const pNameAfter = await profileOf(name);
  record(
    'and the other user\'s profile is unchanged',
    pNameAfter.body?.[0]?.display_name === USERS.name.data.name,
    `got ${JSON.stringify(pNameAfter.body?.[0]?.display_name)}`,
  );
  expectRows('control: a user reads their own profile', await profileOf(full));

  // ------------------------------------------------ a session survives a fresh client
  console.log('\n-- a session survives a freshly constructed client --');
  const shared = memoryStorage();
  const first = clientOver(shared);
  const signedIn = await first.auth.signInWithPassword({ email: full.email, password: PASSWORD });
  record('setup: the client signs in', !signedIn.error && Boolean(signedIn.data.session), signedIn.error?.message);
  record('and persists the session to storage', shared.map.size > 0, 'storage is empty after sign-in');

  const second = clientOver(shared);
  const restored = await second.auth.getSession();
  record(
    'a new client over the same storage recognises the user without credentials',
    restored.data.session?.user?.id === full.id,
    `got ${JSON.stringify(restored.data.session?.user?.id)}`,
  );
  const third = clientOver(memoryStorage());
  const none = await third.auth.getSession();
  record('control: a new client over empty storage has no session', none.data.session === null);

  const out = await first.auth.signOut();
  record('signing out succeeds', !out.error, out.error?.message);
  const afterOut = await first.auth.getSession();
  record('and the client no longer has a session', afterOut.data.session === null);
  record('and storage holds no session', shared.map.size === 0, `storage still holds ${shared.map.size} item(s)`);

  // ------------------------------------------------------------- what sign-out ends
  console.log('\n-- what signing out ends, and what it provably does not --');
  const seededPlain = await rest(cfg, 'tasks', {
    method: 'POST',
    body: { user_id: plain.id, text: 'A task to observe' },
    token: plain.accessToken,
  });
  record('setup: the user has a task to observe', seededPlain.ok, JSON.stringify(seededPlain.body));

  const s1 = await auth('token?grant_type=password', { body: { email: plain.email, password: PASSWORD } });
  const a1 = s1.body?.access_token;
  const r1 = s1.body?.refresh_token;
  record('setup: password sign-in issues access and refresh tokens', Boolean(a1 && r1));
  expectRows('control: the access token reads the user\'s tasks', await rest(cfg, 'tasks?select=id', { token: a1 }));

  // Rotation is on, so this consumes r1. Everything after sign-out is judged
  // against the rotated pair, or it would be rotation under test, not sign-out.
  const s2 = await auth('token?grant_type=refresh_token', { body: { refresh_token: r1 } });
  const a2 = s2.body?.access_token;
  const r2 = s2.body?.refresh_token;
  record('control: the refresh token renews the session before sign-out', s2.ok && Boolean(a2 && r2));

  const logout = await auth('logout', { token: a2 });
  record('signing out is accepted', logout.status === 204, `got ${logout.status}`);

  // Pinned to the exact refusal. Any non-2xx would also be produced by a
  // wedged auth service or a malformed request, and neither is sign-out
  // doing its job.
  const renew = await auth('token?grant_type=refresh_token', { body: { refresh_token: r2 } });
  record(
    'the refresh token is refused after sign-out, so the session cannot continue',
    renew.status === 400 && renew.body?.error_code === 'refresh_token_not_found',
    `expected 400 refresh_token_not_found, got ${renew.status} ${JSON.stringify(renew.body)}`,
  );

  // A stated exception, asserted rather than hidden. Access tokens are
  // stateless: the API verifies the signature and expiry and nothing else, so
  // one issued before sign-out is accepted until it expires. What bounds the
  // exposure is the token lifetime, which is the next assertion.
  expectRows(
    'an access token issued before sign-out is still accepted until it expires (platform property)',
    await rest(cfg, 'tasks?select=id', { token: a2 }),
  );
  const c = claims(a2);
  record(
    `and that token's lifetime is ${JWT_EXPIRY_SECONDS}s, the value this suite expects jwt_expiry to be`,
    c.exp - c.iat === JWT_EXPIRY_SECONDS,
    `exp - iat is ${c.exp - c.iat}`,
  );

  // A claimed expiry is only a bound if the API enforces it. Mint the same
  // token with exp in the past and watch it be refused, beside a control with
  // exp in the future signed the same way, so the refusal is provably about
  // expiry and not about a signature this script got wrong.
  const now = Math.floor(Date.now() / 1000);
  const expired = signHs256({ ...c, iat: now - JWT_EXPIRY_SECONDS - 60, exp: now - 60 }, JWT_SECRET);
  const stillValid = signHs256({ ...c, iat: now, exp: now + 60 }, JWT_SECRET);
  expectRows(
    'control: a token this script signed itself, not yet expired, is accepted',
    await rest(cfg, 'tasks?select=id', { token: stillValid }),
  );
  const refused = await rest(cfg, 'tasks?select=id', { token: expired });
  record(
    'an expired token is refused, so the lifetime is a real bound',
    refused.status === 401,
    `expected 401, got ${refused.status} ${JSON.stringify(refused.body)}`,
  );

  expectEmpty('a request with no token after sign-out sees nothing', await rest(cfg, 'tasks?select=id'));

  // ----------------------------------------------------------------- cleanup
  if (!KEEP) {
    for (const u of [full, name, plain]) await deleteUser(cfg, u.id);
    console.log('\nTest users removed.');
  } else {
    console.log(`\nLeft ${Object.values(USERS).map((u) => u.email).join(', ')} in place.`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);

  writeReceipt({
    script: 'verify-auth',
    exitCode: failed.length > 0 ? 1 : 0,
    passed: results.length - failed.length,
    total: results.length,
  });

  if (failed.length > 0) {
    console.error('\nFailed assertions:');
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('Sessions are obtained, restored, and ended as specified. Access tokens');
  console.log('outlive sign-out by their configured lifetime, which is a stated exception.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nverify-auth crashed: ${err.message}`);
  process.exit(1);
});
