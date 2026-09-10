#!/usr/bin/env node
/**
 * verify-rls
 *
 * Empirically checks the Row Level Security policies by driving PostgREST as
 * three different callers: anonymous, user A, and user B. Every assertion is a
 * real request against a real policy, not a reading of the SQL.
 *
 * Creates two throwaway users, runs the suite, then deletes them. Exits 1 on
 * the first failed assertion class so CI can gate on it.
 *
 * Usage:
 *   node scripts/verify-rls.mjs
 *   node scripts/verify-rls.mjs --keep     leave the test users behind
 *   node scripts/verify-rls.mjs --allow-remote
 *
 * See scripts/README.md for the full contract.
 */

import {
  loadConfig,
  requireConfig,
  assertSafeTarget,
  rest,
  rpc,
  ensureUser,
  signIn,
  deleteUser,
} from './supabase-helpers.mjs';

const args = new Set(process.argv.slice(2));
const KEEP = args.has('--keep');

const cfg = loadConfig();
requireConfig(cfg);
assertSafeTarget(cfg.url, args);

const A_EMAIL = 'rls-a@karya.test';
const B_EMAIL = 'rls-b@karya.test';
const PASSWORD = 'karya-rls-password';

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
}

/** Assert a request was refused by a policy rather than succeeding. */
function expectDenied(name, res) {
  // PostgREST answers a blocked write with 401, 403, or a 42501 error code.
  const denied =
    res.status === 401 ||
    res.status === 403 ||
    (res.body && typeof res.body === 'object' && res.body.code === '42501');
  record(name, denied, `expected a denial, got ${res.status} ${JSON.stringify(res.body)}`);
}

/** Assert a select returned nothing, which is how RLS hides rows. */
function expectEmpty(name, res) {
  const empty = res.ok && Array.isArray(res.body) && res.body.length === 0;
  record(name, empty, `expected 0 rows, got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectRows(name, res, min = 1) {
  const enough = res.ok && Array.isArray(res.body) && res.body.length >= min;
  record(name, enough, `expected at least ${min} row(s), got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectOk(name, res) {
  record(name, res.ok, `expected success, got ${res.status} ${JSON.stringify(res.body)}`);
}

async function main() {
  console.log(`Target: ${cfg.url}\n`);

  const svc = { token: cfg.serviceKey, apikey: cfg.serviceKey };

  const a = await ensureUser(cfg, A_EMAIL, PASSWORD);
  const b = await ensureUser(cfg, B_EMAIL, PASSWORD);
  const aToken = await signIn(cfg, A_EMAIL, PASSWORD);
  const bToken = await signIn(cfg, B_EMAIL, PASSWORD);
  const A = { token: aToken };
  const B = { token: bToken };

  // Give each user one task to reason about.
  const aTask = await rest(cfg, 'tasks', {
    method: 'POST',
    body: { user_id: a.id, text: 'A private task' },
    prefer: 'return=representation',
    ...A,
  });
  expectOk('user A can create their own task', aTask);
  const aTaskId = Array.isArray(aTask.body) ? aTask.body[0]?.id : undefined;

  const bTask = await rest(cfg, 'tasks', {
    method: 'POST',
    body: { user_id: b.id, text: 'B private task' },
    prefer: 'return=representation',
    ...B,
  });
  const bTaskId = Array.isArray(bTask.body) ? bTask.body[0]?.id : undefined;

  console.log('\n-- anonymous --');

  expectEmpty('anonymous cannot read any task', await rest(cfg, 'tasks?select=id'));
  expectEmpty('anonymous cannot read any idea', await rest(cfg, 'ideas?select=id'));
  expectEmpty('anonymous cannot read any group', await rest(cfg, 'groups?select=id'));
  expectDenied(
    'anonymous cannot insert a task',
    await rest(cfg, 'tasks', { method: 'POST', body: { user_id: a.id, text: 'injected' } }),
  );

  console.log('\n-- cross-user isolation --');

  expectRows('user A sees their own task', await rest(cfg, `tasks?select=id&id=eq.${aTaskId}`, A));
  expectEmpty(
    "user A cannot read user B's task",
    await rest(cfg, `tasks?select=id&id=eq.${bTaskId}`, A),
  );
  expectEmpty(
    "user B cannot read user A's task",
    await rest(cfg, `tasks?select=id&id=eq.${aTaskId}`, B),
  );

  expectDenied(
    'user A cannot insert a task owned by user B',
    await rest(cfg, 'tasks', { method: 'POST', body: { user_id: b.id, text: 'spoofed' }, ...A }),
  );

  // A blocked update is not an error. The row is invisible, so zero rows match.
  expectEmpty(
    "user A cannot update user B's task",
    await rest(cfg, `tasks?id=eq.${bTaskId}`, {
      method: 'PATCH',
      body: { text: 'hijacked' },
      prefer: 'return=representation',
      ...A,
    }),
  );

  expectEmpty(
    "user A cannot delete user B's task",
    await rest(cfg, `tasks?id=eq.${bTaskId}`, {
      method: 'DELETE',
      prefer: 'return=representation',
      ...A,
    }),
  );

  // Confirm B's row genuinely survived, so the checks above were not passing
  // because the row had already gone.
  expectRows(
    "user B's task still exists after A's attempts",
    await rest(cfg, `tasks?select=id&id=eq.${bTaskId}`, B),
  );

  console.log('\n-- append-only history --');

  await rest(cfg, 'daily_completions', {
    method: 'POST',
    body: { user_id: a.id, day: new Date().toISOString().slice(0, 10), tasks_completed: 2 },
    ...A,
  });
  expectEmpty(
    'streak history cannot be deleted, no delete policy exists',
    await rest(cfg, `daily_completions?user_id=eq.${a.id}`, {
      method: 'DELETE',
      prefer: 'return=representation',
      ...A,
    }),
  );

  console.log('\n-- groups --');

  const group = await rest(cfg, 'groups', {
    method: 'POST',
    body: { name: 'RLS test group', join_code: 'RLSAAA', owner_id: a.id },
    prefer: 'return=representation',
    ...A,
  });
  expectOk('user A can create a group', group);
  const groupId = Array.isArray(group.body) ? group.body[0]?.id : undefined;

  expectRows(
    'the creator is added as a member automatically',
    await rest(cfg, `group_members?select=user_id&group_id=eq.${groupId}`, A),
  );

  expectEmpty(
    'a non-member cannot see the group',
    await rest(cfg, `groups?select=id&id=eq.${groupId}`, B),
  );
  expectEmpty(
    'a non-member cannot see group tasks',
    await rest(cfg, `group_tasks?select=id&group_id=eq.${groupId}`, B),
  );
  expectDenied(
    'a non-member cannot add themselves directly',
    await rest(cfg, 'group_members', {
      method: 'POST',
      body: { group_id: groupId, user_id: b.id },
      ...B,
    }),
  );

  const joined = await rpc(cfg, 'join_group_with_code', { p_join_code: 'RLSAAA' }, B);
  record(
    'a valid join code admits the user',
    joined.ok && joined.body === groupId,
    `expected ${groupId}, got ${joined.status} ${JSON.stringify(joined.body)}`,
  );

  expectRows(
    'after joining, the member can see the group',
    await rest(cfg, `groups?select=id&id=eq.${groupId}`, B),
  );

  const badCode = await rpc(cfg, 'join_group_with_code', { p_join_code: 'ZZZZZZ' }, B);
  record(
    'an unknown join code reveals nothing',
    badCode.ok && badCode.body === null,
    `expected null, got ${badCode.status} ${JSON.stringify(badCode.body)}`,
  );

  // A DELETE blocked by a policy is not an error. The row is invisible to the
  // caller, so zero rows match and PostgREST answers 200 with an empty array.
  // Expecting a 403 here was wrong: it describes a rejected write, not a
  // hidden row.
  expectEmpty(
    'a member deleting a group they do not own removes nothing',
    await rest(cfg, `groups?id=eq.${groupId}`, {
      method: 'DELETE',
      prefer: 'return=representation',
      ...B,
    }),
  );

  // The empty result above is necessary but not sufficient: a wide-open policy
  // that happened to match nothing would look identical. Confirm with the
  // owner's own token that the group is genuinely still there.
  expectRows(
    'the group survives a non-owner delete attempt',
    await rest(cfg, `groups?select=id&id=eq.${groupId}`, A),
  );

  console.log('\n-- service role --');

  expectRows(
    'the service role bypasses RLS, confirming rows really exist',
    await rest(cfg, 'tasks?select=id', svc),
    2,
  );

  // ---------------------------------------------------------------- cleanup

  if (!KEEP) {
    await deleteUser(cfg, a.id);
    await deleteUser(cfg, b.id);
    console.log('\nTest users removed.');
  } else {
    console.log(`\nLeft ${A_EMAIL} and ${B_EMAIL} in place.`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);

  if (failed.length > 0) {
    console.error('\nFailed assertions:');
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('Row Level Security behaved correctly for every case checked.');
}

main().catch((err) => {
  console.error(`\nverify-rls crashed: ${err.message}`);
  process.exit(1);
});
