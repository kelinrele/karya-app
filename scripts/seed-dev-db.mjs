#!/usr/bin/env node
/**
 * seed-dev-db
 *
 * Wipes the development database and reseeds it with realistic Karya data so
 * the UI has something to render. Refuses to touch a non-local target unless
 * --allow-remote is passed, because it deletes rows.
 *
 * Usage:
 *   node scripts/seed-dev-db.mjs
 *   node scripts/seed-dev-db.mjs --keep-user   reseed without recreating the user
 *   node scripts/seed-dev-db.mjs --allow-remote
 *
 * See scripts/README.md for the full contract.
 */

import {
  loadConfig,
  requireConfig,
  assertSafeTarget,
  rest,
  ensureUser,
  deleteUser,
  writeReceipt,
} from './supabase-helpers.mjs';

const args = new Set(process.argv.slice(2));
const KEEP_USER = args.has('--keep-user');

const cfg = loadConfig();
requireConfig(cfg);
assertSafeTarget(cfg.url, args);

const DEV_EMAIL = 'dev@karya.test';
const DEV_PASSWORD = 'karya-dev-password';

const svc = { token: cfg.serviceKey, apikey: cfg.serviceKey };

/** Days offset from today as an ISO date string. */
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Hours offset from now as an ISO timestamp. */
function hour(offset) {
  const d = new Date();
  d.setHours(d.getHours() + offset, 0, 0, 0);
  return d.toISOString();
}

// PostgREST rejects a bulk insert whose objects have differing key sets with
// PGRST102 "All object keys must match". The fixtures below deliberately vary
// (some carry a due date, others a period), so each is normalised against this
// shape before insert rather than relying on column defaults to fill the gaps.
const TASK_DEFAULTS = {
  text: null,
  priority: 'medium',
  estimated_minutes: null,
  completed: false,
  schedule_type: 'due_date',
  due_date: null,
  due_time: null,
  begins_at: null,
  ends_at: null,
  substeps: [],
};

// The seed deliberately covers the awkward cases, not just the happy path:
// an overdue task, a time-period task, a task with partial substeps, a
// completed task, and a task with no date at all.
const TASKS = [
  {
    text: 'Email the property manager about the boiler',
    priority: 'urgent',
    estimated_minutes: 15,
    schedule_type: 'due_date',
    due_date: day(-2),
    substeps: [],
  },
  {
    text: 'Finish the quarterly report',
    priority: 'high',
    estimated_minutes: 120,
    schedule_type: 'due_date',
    due_date: day(0),
    due_time: '17:00',
    substeps: [
      { text: 'Pull the numbers', completed: true },
      { text: 'Draft the summary', completed: true },
      { text: 'Review with Sam', completed: false },
      { text: 'Send it', completed: false },
    ],
  },
  {
    text: 'Deep work block on the migration',
    priority: 'high',
    estimated_minutes: 90,
    schedule_type: 'time_period',
    begins_at: hour(2),
    ends_at: hour(4),
    substeps: [],
  },
  {
    text: 'Book the dentist',
    priority: 'medium',
    estimated_minutes: 10,
    schedule_type: 'due_date',
    due_date: day(1),
    substeps: [],
  },
  {
    text: 'Read two chapters',
    priority: 'low',
    estimated_minutes: 45,
    schedule_type: 'due_date',
    due_date: day(3),
    substeps: [],
  },
  {
    text: 'Someday: learn to sail',
    priority: 'low',
    schedule_type: 'due_date',
    substeps: [],
  },
  {
    text: 'Renew the domain',
    priority: 'medium',
    estimated_minutes: 5,
    completed: true,
    schedule_type: 'due_date',
    due_date: day(-1),
    substeps: [],
  },
];

const IDEAS = [
  'Weekly review template',
  'Try timeboxing the inbox',
  'Ask about the conference budget',
  'Rework the streak animation',
];

// Fourteen days of history with a deliberate gap, so streak logic is exercised
// rather than just rendered.
const COMPLETIONS = [
  { offset: -13, count: 3 },
  { offset: -12, count: 5 },
  { offset: -11, count: 2 },
  // -10 missing on purpose: the streak must break here.
  { offset: -9, count: 4 },
  { offset: -8, count: 1 },
  { offset: -7, count: 6 },
  { offset: -6, count: 2 },
  { offset: -5, count: 3 },
  { offset: -4, count: 4 },
  { offset: -3, count: 2 },
  { offset: -2, count: 5 },
  { offset: -1, count: 3 },
  { offset: 0, count: 1 },
];

async function wipe(userId) {
  // Order matters only for readability; cascades handle the rest.
  for (const table of ['tasks', 'ideas', 'daily_completions']) {
    const res = await rest(cfg, `${table}?user_id=eq.${userId}`, { method: 'DELETE', ...svc });
    if (!res.ok) throw new Error(`Wipe of ${table} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const groups = await rest(cfg, `groups?owner_id=eq.${userId}`, { method: 'DELETE', ...svc });
  if (!groups.ok) {
    throw new Error(`Wipe of groups failed: ${groups.status} ${JSON.stringify(groups.body)}`);
  }
}

async function insert(table, rows) {
  if (rows.length === 0) return [];
  const res = await rest(cfg, table, {
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
    ...svc,
  });
  if (!res.ok) {
    throw new Error(`Insert into ${table} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body ?? [];
}

async function main() {
  console.log(`Target: ${cfg.url}`);

  let user;
  if (KEEP_USER) {
    user = await ensureUser(cfg, DEV_EMAIL, DEV_PASSWORD);
    console.log(`Reusing ${DEV_EMAIL} (${user.id})`);
  } else {
    // Deleting the user cascades every owned row, which is the cleanest wipe
    // available and proves the foreign keys are correct at the same time.
    const existing = await ensureUser(cfg, DEV_EMAIL, DEV_PASSWORD);
    if (!existing.created) {
      await deleteUser(cfg, existing.id);
      console.log(`Removed previous ${DEV_EMAIL}`);
    }
    user = await ensureUser(cfg, DEV_EMAIL, DEV_PASSWORD);
    console.log(`Created ${DEV_EMAIL} (${user.id})`);
  }

  await wipe(user.id);

  const tasks = await insert(
    'tasks',
    TASKS.map((t) => ({ ...TASK_DEFAULTS, ...t, user_id: user.id })),
  );
  const ideas = await insert(
    'ideas',
    IDEAS.map((text) => ({ text, user_id: user.id })),
  );
  const completions = await insert(
    'daily_completions',
    COMPLETIONS.map((c) => ({ user_id: user.id, day: day(c.offset), tasks_completed: c.count })),
  );

  const group = await insert('groups', [
    { name: 'Flat admin', join_code: 'KARYA1', owner_id: user.id },
  ]);

  const groupId = group[0]?.id;
  let groupTasks = [];
  if (groupId) {
    groupTasks = await insert('group_tasks', [
      { group_id: groupId, text: 'Split the utilities', created_by: user.id },
      { group_id: groupId, text: 'Chase the deposit', created_by: user.id },
    ]);
  }

  console.log('\nSeeded:');
  console.log(`  tasks              ${tasks.length}`);
  console.log(`  ideas              ${ideas.length}`);
  console.log(`  daily_completions  ${completions.length}`);
  console.log(`  groups             ${group.length}`);
  console.log(`  group_tasks        ${groupTasks.length}`);
  // Seeding is setup rather than verification, but a task names it, so a
  // receipt is what lets that claim be checked rather than trusted.
  writeReceipt({
    script: 'seed-dev-db',
    exitCode: 0,
    passed: tasks.length + ideas.length + completions.length,
    total: tasks.length + ideas.length + completions.length,
  });

  console.log(`\nSign in as ${DEV_EMAIL} / ${DEV_PASSWORD}`);
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exit(1);
});
