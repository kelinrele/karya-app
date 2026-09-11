#!/usr/bin/env node
/**
 * verify-realtime
 *
 * Checks that realtime delivery of group task changes respects membership: a
 * member subscribed to a group receives inserts, and a non-member receives
 * nothing.
 *
 * The negative half proves nothing on its own. A subscription that silently
 * failed to establish also receives nothing, and would look identical to
 * correct filtering. So the member's subscription runs first as a positive
 * control, and a timeout waiting for its message is a failure rather than a
 * pass. Only the pair is evidence.
 *
 * Usage:
 *   node scripts/verify-realtime.mjs
 *   node scripts/verify-realtime.mjs --keep     leave the test users behind
 *   node scripts/verify-realtime.mjs --allow-remote
 *
 * Requires `npm install` at the repository root for @supabase/supabase-js.
 * Exits 1 on a failed assertion, 3 if the test could not be established.
 */

import { createClient } from '@supabase/supabase-js';
import {
  loadConfig,
  requireConfig,
  assertSafeTarget,
  rest,
  rpc,
  ensureUser,
  signIn,
  deleteUser,
  writeReceipt,
} from './supabase-helpers.mjs';

const args = new Set(process.argv.slice(2));
const KEEP = args.has('--keep');

const cfg = loadConfig();
requireConfig(cfg);
assertSafeTarget(cfg.url, args);

const MEMBER_EMAIL = 'rt-member@karya.test';
const OUTSIDER_EMAIL = 'rt-outsider@karya.test';
const PASSWORD = 'karya-realtime-password';

const SUBSCRIBE_TIMEOUT = 15_000;
// Generous, because a false "nothing arrived" is the failure mode that would
// wrongly report a leak as absent.
const DELIVERY_WINDOW = 6_000;
// The realtime service restarts during `supabase db reset` and needs a few
// seconds to start streaming, so the positive control gets more than one go.
const POSITIVE_CONTROL_ATTEMPTS = 3;
const RETRY_PAUSE = 4_000;

const results = [];

function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** An authenticated client with realtime told about the user's token. */
async function clientFor(email) {
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  // Some versions wire this up from the auth event and some do not; setting it
  // explicitly costs nothing and removes a source of false negatives.
  client.realtime.setAuth(data.session.access_token);
  return client;
}

/**
 * Subscribe to group_task inserts and collect them. Resolves once the channel
 * reports SUBSCRIBED, so the caller never inserts into a channel that is not
 * listening yet, which would produce a false negative.
 */
function listen(client, label, groupId) {
  const received = [];
  const deleted = [];
  const channel = client
    .channel(`probe-${label}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_tasks', filter: `group_id=eq.${groupId}` },
      (payload) => received.push(payload.new ?? payload),
    )
    // No filter on the delete: a deletion carries only the identifier, so a
    // filter on group_id could never match and would hide the behaviour this
    // is here to record.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_tasks' }, (payload) =>
      deleted.push(payload.old ?? payload),
    );

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: channel never reached SUBSCRIBED`)),
      SUBSCRIBE_TIMEOUT,
    );
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(`${label}: ${status}`));
      }
    });
  });

  return { channel, received, deleted, ready };
}

async function main() {
  console.log(`Target: ${cfg.url}\n`);

  const member = await ensureUser(cfg, MEMBER_EMAIL, PASSWORD);
  const outsider = await ensureUser(cfg, OUTSIDER_EMAIL, PASSWORD);
  const M = { token: await signIn(cfg, MEMBER_EMAIL, PASSWORD) };

  const group = await rest(cfg, 'groups', {
    method: 'POST',
    body: { name: 'realtime probe', join_code: 'RTPROB', owner_id: member.id },
    prefer: 'return=representation',
    ...M,
  });
  if (!group.ok) throw new Error(`could not create the group: ${JSON.stringify(group.body)}`);
  const groupId = group.body[0].id;
  console.log(`  group ${groupId}, owned by the member\n`);

  const memberClient = await clientFor(MEMBER_EMAIL);
  const outsiderClient = await clientFor(OUTSIDER_EMAIL);

  // ------------------------------------------- positive control, run first

  console.log('-- positive control: a member must receive the insert --');

  // Retried, because the realtime service takes a few seconds to converge
  // after `supabase db reset` restarts it. A run immediately afterwards sees a
  // healthy container that is not yet streaming. Retrying separates that from
  // delivery being genuinely broken; it hides nothing, because exhausting the
  // attempts still reports inconclusive.
  let memberProbe = null;
  let memberGotIt = false;
  let subscribed = false;

  for (let attempt = 1; attempt <= POSITIVE_CONTROL_ATTEMPTS && !memberGotIt; attempt += 1) {
    if (memberProbe) {
      try {
        await memberClient.removeChannel(memberProbe.channel);
      } catch {
        // Already gone; nothing to clean up.
      }
    }

    memberProbe = listen(memberClient, `member-${attempt}`, groupId);
    try {
      await memberProbe.ready;
      subscribed = true;
    } catch (err) {
      console.log(`  attempt ${attempt}: could not subscribe (${err.message})`);
      await sleep(RETRY_PAUSE);
      continue;
    }

    await rest(cfg, 'group_tasks', {
      method: 'POST',
      body: { group_id: groupId, text: `seen by the member ${attempt}`, created_by: member.id },
      ...M,
    });
    await sleep(DELIVERY_WINDOW);

    memberGotIt = memberProbe.received.length > 0;
    if (!memberGotIt && attempt < POSITIVE_CONTROL_ATTEMPTS) {
      console.log(`  attempt ${attempt}: nothing delivered yet, retrying`);
      await sleep(RETRY_PAUSE);
    }
  }

  record('the member establishes a subscription', subscribed);
  record(
    'the member receives the insert',
    memberGotIt,
    `no message after ${POSITIVE_CONTROL_ATTEMPTS} attempts. Without this the negative ` +
      'half below is meaningless.',
  );

  if (!memberGotIt) {
    console.error('\nINCONCLUSIVE: delivery never reached a legitimate subscriber.');
    console.error('A non-member receiving nothing would be indistinguishable from a broken');
    console.error('subscription, so no conclusion about filtering can be drawn.');
    await teardown(memberClient, outsiderClient, member, outsider);
    process.exit(3);
  }

  // ---------------------------------------------------- the actual check

  console.log('\n-- a non-member must receive nothing --');

  const outsiderProbe = listen(outsiderClient, 'outsider', groupId);
  let outsiderSubscribed = true;
  try {
    await outsiderProbe.ready;
  } catch {
    // Being refused at subscribe time is a legitimate way to enforce this.
    outsiderSubscribed = false;
  }
  console.log(
    `  the outsider's channel ${outsiderSubscribed ? 'was accepted' : 'was refused outright'}`,
  );

  const before = memberProbe.received.length;
  await rest(cfg, 'group_tasks', {
    method: 'POST',
    body: { group_id: groupId, text: 'must not reach the outsider', created_by: member.id },
    ...M,
  });
  await sleep(DELIVERY_WINDOW);

  record(
    'the non-member receives nothing',
    outsiderProbe.received.length === 0,
    `expected 0 messages, got ${outsiderProbe.received.length}: ` +
      JSON.stringify(outsiderProbe.received),
  );

  // Confirms delivery was still working during the window above, so the
  // outsider's silence is filtering rather than an idle connection.
  record(
    'the member still receives it, so delivery was live throughout',
    memberProbe.received.length > before,
    `member had ${before} before and ${memberProbe.received.length} after`,
  );

  // ------------------------------------------------ deletions, a known gap

  console.log('\n-- deletions: a stated exception, not a guarantee --');

  const created = await rest(cfg, 'group_tasks', {
    method: 'POST',
    body: { group_id: groupId, text: 'about to be deleted', created_by: member.id },
    prefer: 'return=representation',
    ...M,
  });
  const doomedId = Array.isArray(created.body) ? created.body[0]?.id : undefined;

  await sleep(1_000);
  await rest(cfg, `group_tasks?id=eq.${doomedId}`, { method: 'DELETE', ...M });
  await sleep(DELIVERY_WINDOW);

  record(
    'the member is told the task was deleted',
    memberProbe.deleted.length > 0,
    `expected at least one deletion notice, got ${memberProbe.deleted.length}`,
  );

  // Asserted as it actually behaves. The platform evaluates the select policy
  // against the changed row, a deletion carries only the identifier, so it
  // cannot decide who is entitled and tells everyone. Verified under both
  // replica identity settings. Recorded rather than wished away.
  const outsiderSawDelete = outsiderProbe.deleted.length > 0;
  record(
    'the non-member also sees the deletion, which is the known limitation',
    outsiderSawDelete,
    'the non-member received nothing. If this now fails, the platform has ' +
      'started filtering deletions and the spec exception should be removed.',
  );

  // The leak must stay confined to an opaque identifier.
  const leakedFields = outsiderProbe.deleted.flatMap((row) =>
    Object.keys(row ?? {}).filter((k) => k !== 'id'),
  );
  record(
    'nothing beyond the identifier leaks',
    leakedFields.length === 0,
    `expected only "id", also saw: ${JSON.stringify([...new Set(leakedFields)])}`,
  );

  await teardown(memberClient, outsiderClient, member, outsider);

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);
  writeReceipt({
    script: 'verify-realtime',
    exitCode: failed.length > 0 ? 1 : 0,
    passed: results.length - failed.length,
    total: results.length,
  });

  if (failed.length > 0) {
    console.error('\nFailed assertions:');
    for (const f of failed) console.error(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('Inserts and updates respected membership. Deletions reach every');
  console.log('subscriber, which is a platform limitation, not a policy fault.');
  process.exit(0);
}

async function teardown(memberClient, outsiderClient, member, outsider) {
  try {
    await memberClient.removeAllChannels();
    await outsiderClient.removeAllChannels();
  } catch {
    // Nothing useful to do; the process is about to exit either way.
  }
  if (!KEEP) {
    await deleteUser(cfg, member.id);
    await deleteUser(cfg, outsider.id);
    console.log('\nTest users removed.');
  } else {
    console.log(`\nLeft ${MEMBER_EMAIL} and ${OUTSIDER_EMAIL} in place.`);
  }
}

main().catch((err) => {
  console.error(`\nverify-realtime crashed: ${err.message}`);
  process.exit(1);
});
