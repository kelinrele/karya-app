#!/usr/bin/env node
/**
 * verify-constraints
 *
 * Checks the guarantees the database makes about its own data, as opposed to
 * who may read it. Three areas:
 *
 *   1. The schedule constraint rejects tasks nobody could render.
 *   2. Completion time belongs to the database, not to the client.
 *   3. Deleting an account removes exactly the right rows, and no more.
 *
 * Access control is covered separately by verify-rls.mjs.
 *
 * Usage:
 *   node scripts/verify-constraints.mjs
 *   node scripts/verify-constraints.mjs --keep     leave the test users behind
 *   node scripts/verify-constraints.mjs --allow-remote
 *
 * Exits 1 if any assertion fails. Zero dependencies.
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

const A_EMAIL = 'con-a@karya.test';
const B_EMAIL = 'con-b@karya.test';
const PASSWORD = 'karya-constraints-password';

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
}

/** A write the database must refuse outright. */
function expectRefused(name, res) {
  // A check or not-null violation surfaces as 400 with a 23xxx SQLSTATE.
  const refused =
    !res.ok &&
    res.body &&
    typeof res.body === 'object' &&
    typeof res.body.code === 'string' &&
    res.body.code.startsWith('23');
  record(name, refused, `expected a constraint violation, got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectOk(name, res) {
  record(name, res.ok, `expected success, got ${res.status} ${JSON.stringify(res.body)}`);
}

function expectEqual(name, actual, expected) {
  const ok = actual === expected;
  record(name, ok, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectCount(name, res, expected) {
  const n = Array.isArray(res.body) ? res.body.length : -1;
  record(name, n === expected, `expected ${expected} row(s), got ${n}: ${JSON.stringify(res.body)}`);
}

async function main() {
  console.log(`Target: ${cfg.url}\n`);

  const svc = { token: cfg.serviceKey, apikey: cfg.serviceKey };

  const a = await ensureUser(cfg, A_EMAIL, PASSWORD);
  const b = await ensureUser(cfg, B_EMAIL, PASSWORD);
  const A = { token: await signIn(cfg, A_EMAIL, PASSWORD) };
  const B = { token: await signIn(cfg, B_EMAIL, PASSWORD) };

  // ------------------------------------------------- 3.2 schedule constraint

  console.log('-- schedule constraint --');

  const base = { user_id: a.id, text: 'constraint probe' };

  expectRefused(
    'a task carrying both a due date and a period is refused',
    await rest(cfg, 'tasks', {
      method: 'POST',
      body: {
        ...base,
        schedule_type: 'time_period',
        due_date: '2026-01-01',
        begins_at: '2026-01-01T09:00:00Z',
        ends_at: '2026-01-01T10:00:00Z',
      },
      ...A,
    }),
  );

  expectRefused(
    'a period task with no end is refused',
    await rest(cfg, 'tasks', {
      method: 'POST',
      body: { ...base, schedule_type: 'time_period', begins_at: '2026-01-01T09:00:00Z' },
      ...A,
    }),
  );

  expectRefused(
    'a period ending before it begins is refused',
    await rest(cfg, 'tasks', {
      method: 'POST',
      body: {
        ...base,
        schedule_type: 'time_period',
        begins_at: '2026-01-01T10:00:00Z',
        ends_at: '2026-01-01T09:00:00Z',
      },
      ...A,
    }),
  );

  expectRefused(
    'a task with a whitespace-only title is refused',
    await rest(cfg, 'tasks', { method: 'POST', body: { ...base, text: '   ' }, ...A }),
  );

  // A constraint that errors while still writing is worse than none, so the
  // absence of the rows is asserted rather than assumed from the error.
  expectCount(
    'none of the four refused tasks was written',
    await rest(cfg, `tasks?select=id&user_id=eq.${a.id}&text=eq.constraint%20probe`, svc),
    0,
  );

  // ------------------------------------------------ 3.3 completion ownership

  console.log('\n-- completion time is the database\'s --');

  const created = await rest(cfg, 'tasks', {
    method: 'POST',
    body: { user_id: a.id, text: 'completion probe' },
    prefer: 'return=representation',
    ...A,
  });
  expectOk('a task is created for the completion checks', created);
  const taskId = Array.isArray(created.body) ? created.body[0]?.id : undefined;
  expectEqual(
    'a new incomplete task has no completion time',
    Array.isArray(created.body) ? created.body[0]?.completed_at : 'no row',
    null,
  );

  const completed = await rest(cfg, `tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: { completed: true },
    prefer: 'return=representation',
    ...A,
  });
  const completedAt = Array.isArray(completed.body) ? completed.body[0]?.completed_at : null;
  record(
    'completing a task sets its completion time',
    typeof completedAt === 'string' && completedAt.length > 0,
    `expected a timestamp, got ${JSON.stringify(completedAt)}`,
  );

  const reopened = await rest(cfg, `tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: { completed: false },
    prefer: 'return=representation',
    ...A,
  });
  expectEqual(
    'reopening a task clears its completion time',
    Array.isArray(reopened.body) ? reopened.body[0]?.completed_at : 'no row',
    null,
  );

  // The forged cases. A client must never be able to choose this value, or
  // streak history can be backdated at will.
  const FORGED = '2020-01-01T00:00:00+00:00';

  const forgedAlone = await rest(cfg, `tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: { completed_at: FORGED },
    prefer: 'return=representation',
    ...A,
  });
  expectEqual(
    'a completion time sent on its own is ignored',
    Array.isArray(forgedAlone.body) ? forgedAlone.body[0]?.completed_at : 'no row',
    null,
  );

  const forgedWithEdit = await rest(cfg, `tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: { text: 'completion probe edited', completed_at: FORGED },
    prefer: 'return=representation',
    ...A,
  });
  expectEqual(
    'a completion time smuggled alongside an edit is ignored',
    Array.isArray(forgedWithEdit.body) ? forgedWithEdit.body[0]?.completed_at : 'no row',
    null,
  );

  const forgedOnComplete = await rest(cfg, `tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: { completed: true, completed_at: FORGED },
    prefer: 'return=representation',
    ...A,
  });
  const onComplete = Array.isArray(forgedOnComplete.body)
    ? forgedOnComplete.body[0]?.completed_at
    : null;
  record(
    'a completion time sent while completing is overridden',
    typeof onComplete === 'string' && onComplete !== FORGED,
    `expected the server's own timestamp, got ${JSON.stringify(onComplete)}`,
  );

  // ----------------------------------------------------- 3.4 account cascade

  console.log('\n-- account cascade --');

  // A owns one group; B owns another that A joins. A creates a task in each.
  const groupA = await rest(cfg, 'groups', {
    method: 'POST',
    body: { name: 'A owns this', join_code: 'CONAAA', owner_id: a.id },
    prefer: 'return=representation',
    ...A,
  });
  const groupAId = Array.isArray(groupA.body) ? groupA.body[0]?.id : undefined;

  const groupB = await rest(cfg, 'groups', {
    method: 'POST',
    body: { name: 'B owns this', join_code: 'CONBBB', owner_id: b.id },
    prefer: 'return=representation',
    ...B,
  });
  const groupBId = Array.isArray(groupB.body) ? groupB.body[0]?.id : undefined;

  const joined = await rpc(cfg, 'join_group_with_code', { p_join_code: 'CONBBB' }, A);
  expectEqual('user A joins the group user B owns', joined.body, groupBId);

  const taskInA = await rest(cfg, 'group_tasks', {
    method: 'POST',
    body: { group_id: groupAId, text: 'in the group A owns', created_by: a.id },
    prefer: 'return=representation',
    ...A,
  });
  expectOk('user A adds a task to their own group', taskInA);

  const taskInB = await rest(cfg, 'group_tasks', {
    method: 'POST',
    body: { group_id: groupBId, text: "in the group B owns", created_by: a.id },
    prefer: 'return=representation',
    ...A,
  });
  expectOk("user A adds a task to user B's group", taskInB);
  const taskInBId = Array.isArray(taskInB.body) ? taskInB.body[0]?.id : undefined;

  await rest(cfg, 'ideas', { method: 'POST', body: { user_id: a.id, text: 'an idea' }, ...A });
  await rest(cfg, 'daily_completions', {
    method: 'POST',
    body: { user_id: a.id, day: new Date().toISOString().slice(0, 10), tasks_completed: 1 },
    ...A,
  });

  await deleteUser(cfg, a.id);
  console.log(`  (deleted ${A_EMAIL})`);

  // Everything owned outright should be gone.
  // Selected by user_id rather than id: daily_completions is keyed on
  // (user_id, day) and has no id column of its own.
  for (const table of ['tasks', 'ideas', 'daily_completions']) {
    expectCount(
      `${table} belonging to the deleted user are removed`,
      await rest(cfg, `${table}?select=user_id&user_id=eq.${a.id}`, svc),
      0,
    );
  }
  expectCount(
    'the deleted user\'s profile is removed',
    await rest(cfg, `profiles?select=id&id=eq.${a.id}`, svc),
    0,
  );
  expectCount(
    'the deleted user\'s memberships are removed',
    await rest(cfg, `group_members?select=user_id&user_id=eq.${a.id}`, svc),
    0,
  );
  expectCount(
    'the group the deleted user owned is removed',
    await rest(cfg, `groups?select=id&id=eq.${groupAId}`, svc),
    0,
  );
  expectCount(
    'tasks inside that group go with it',
    await rest(cfg, `group_tasks?select=id&group_id=eq.${groupAId}`, svc),
    0,
  );

  // ...but nothing belonging to someone else should be. Checking only that
  // rows disappear would pass against a schema that deletes far too much.
  expectCount(
    "the group owned by another user survives",
    await rest(cfg, `groups?select=id&id=eq.${groupBId}`, svc),
    1,
  );
  const survivor = await rest(cfg, `group_tasks?select=id,created_by&id=eq.${taskInBId}`, svc);
  expectCount("the deleted user's task in that group survives", survivor, 1);
  expectEqual(
    'its creator is nulled rather than the row being deleted',
    Array.isArray(survivor.body) ? survivor.body[0]?.created_by : 'no row',
    null,
  );

  // ---------------------------------------------------------------- cleanup

  if (!KEEP) {
    await deleteUser(cfg, b.id);
    console.log('\nTest users removed.');
  } else {
    console.log(`\nLeft ${B_EMAIL} in place.`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);

  if (failed.length > 0) {
    console.error('\nFailed assertions:');
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('Constraints, triggers, and cascades behaved correctly.');
}

main().catch((err) => {
  console.error(`\nverify-constraints crashed: ${err.message}`);
  process.exit(1);
});
