/**
 * Runnable check for the batch data foundation. No framework.
 *
 *   npx tsx lib/batches.check.ts                       # pure logic only
 *   npx dotenv -e ../.env -- npx tsx lib/batches.check.ts   # + the live-DB half
 *
 * Part 1 (always) asserts the step-gating logic: that a step is complete only
 * when the facts say so, and that a forward jump — Approve reachable from
 * Upload, which is what the v17 prototype allowed — is refused.
 *
 * Part 2 needs a database. It asserts that an anon-key request sees zero rows
 * in `batches`, and it REFUSES to treat a missing table as a pass: a table that
 * does not exist also returns zero rows, which is how this check would go green
 * on a database where migration 032 was never applied. Existence is proved with
 * the service key before the anon result is allowed to count.
 */
import assert from 'node:assert/strict';
import {
  canEnterStep,
  deriveBatchSteps,
  EMPTY_COUNTS,
  periodLabel,
  toBatchPayload,
  toCounts,
  type BatchCounts,
} from './batch-state';

const counts = (over: Partial<BatchCounts> = {}): BatchCounts => ({ ...EMPTY_COUNTS, ...over });

let n = 0;
const check = (fn: () => void) => {
  fn();
  n++;
};

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the gating rule. Pure, always runs.
// ─────────────────────────────────────────────────────────────────────────────

// A brand-new batch: nothing uploaded, so only step 1 is open.
check(() => {
  const s = deriveBatchSteps(counts(), 'open');
  assert.equal(s.current_step, 1);
  assert.deepEqual(s.steps.map((x) => x.complete), [false, false, false, false]);
  assert.deepEqual(s.steps.map((x) => x.unlocked), [true, false, false, false]);
  assert.equal(s.can_approve, false);
});

// Uploaded but still extracting: step 1 is NOT complete, so Match stays locked.
check(() => {
  const s = deriveBatchSteps(counts({ jobs_total: 1, jobs_running: 1 }), 'open');
  assert.equal(s.current_step, 1);
  assert.equal(s.steps[1].unlocked, false);
  assert.match(s.steps[0].reason!, /still extracting/);
});

// A job that finished but produced no cheques must not open Match either.
check(() => {
  const s = deriveBatchSteps(counts({ jobs_total: 1, jobs_complete: 1, checks_total: 0 }), 'open');
  assert.equal(s.current_step, 1);
  assert.match(s.steps[0].reason!, /No cheques were extracted/);
});

// Extraction done, matching not run: step 1 complete, step 2 current.
check(() => {
  const s = deriveBatchSteps(counts({ jobs_total: 1, jobs_complete: 1, checks_total: 24 }), 'open');
  assert.equal(s.current_step, 2);
  assert.deepEqual(s.steps.map((x) => x.complete), [true, false, false, false]);
  assert.deepEqual(s.steps.map((x) => x.unlocked), [true, true, false, false]);
});

// Matching partially run is not "matched".
check(() => {
  const s = deriveBatchSteps(
    counts({ jobs_complete: 1, checks_total: 24, matches_total: 10, needs_attention: 10 }),
    'open'
  );
  assert.equal(s.current_step, 2);
  assert.match(s.steps[1].reason!, /10 of 24/);
});

// Michael's card: every cheque matched, 24 still need attention -> Step 3 of 4.
check(() => {
  const s = deriveBatchSteps(
    counts({ jobs_total: 2, jobs_complete: 2, checks_total: 40, matches_total: 40, needs_attention: 24, matched: 16 }),
    'open'
  );
  assert.equal(s.current_step, 3);
  assert.equal(s.can_approve, false);
  assert.match(s.steps[2].reason!, /24 cheques need attention/);
});

// Review cleared -> step 4 current, approval permitted but not yet done.
check(() => {
  const s = deriveBatchSteps(
    counts({ jobs_complete: 1, checks_total: 40, matches_total: 40, needs_attention: 0, matched: 40 }),
    'open'
  );
  assert.equal(s.current_step, 4);
  assert.equal(s.can_approve, true);
  assert.equal(s.steps[3].complete, false);
  assert.equal(s.steps[3].unlocked, true);
});

// Approved: all four complete, and current_step stays 4 (never 5).
check(() => {
  const s = deriveBatchSteps(
    counts({ jobs_complete: 1, checks_total: 40, matches_total: 40, approved: 40 }),
    'complete'
  );
  assert.deepEqual(s.steps.map((x) => x.complete), [true, true, true, true]);
  assert.equal(s.current_step, 4);
});

// status='complete' cannot fake step 4 while the facts say otherwise. A row
// hand-edited past the trigger must still render as unfinished.
check(() => {
  const s = deriveBatchSteps(counts({ jobs_complete: 1, checks_total: 5, matches_total: 5, needs_attention: 2 }), 'complete');
  assert.equal(s.steps[3].complete, false);
  assert.equal(s.current_step, 3);
});

// ── The forward jump. This is the defect being closed. ──────────────────────
check(() => {
  const fresh = deriveBatchSteps(counts(), 'open');
  for (const step of [2, 3, 4]) {
    const gate = canEnterStep(step, fresh);
    assert.equal(gate.ok, false, `step ${step} must be refused on an empty batch`);
    assert.equal(gate.blocking_step, 1);
    assert.ok(gate.reason && gate.reason.length > 0, 'a refusal must say why');
  }
  assert.equal(canEnterStep(1, fresh).ok, true, 'step 1 is always reachable');
});

check(() => {
  // Uploaded only: Approve (4) is refused, and the blocking step is Match (2),
  // not a generic failure.
  const uploaded = deriveBatchSteps(counts({ jobs_complete: 1, checks_total: 3 }), 'open');
  const gate = canEnterStep(4, uploaded);
  assert.equal(gate.ok, false);
  assert.equal(gate.blocking_step, 2);
  assert.deepEqual(gate.missing.map((m) => m.step), [2, 3]);
  assert.equal(canEnterStep(2, uploaded).ok, true);
  assert.equal(canEnterStep(3, uploaded).ok, false);
});

check(() => {
  // Going back is always allowed: step 3 reached means 1 and 2 are facts.
  const review = deriveBatchSteps(
    counts({ jobs_complete: 1, checks_total: 9, matches_total: 9, needs_attention: 1 }),
    'open'
  );
  assert.equal(canEnterStep(1, review).ok, true);
  assert.equal(canEnterStep(2, review).ok, true);
  assert.equal(canEnterStep(3, review).ok, true);
  assert.equal(canEnterStep(4, review).ok, false);
  assert.equal(canEnterStep(4, review).blocking_step, 3);
});

// Junk step values fail closed rather than throwing or passing.
check(() => {
  const done = deriveBatchSteps(
    counts({ jobs_complete: 1, checks_total: 1, matches_total: 1, approved: 1 }),
    'complete'
  );
  for (const junk of [0, 5, -1, 1.5, NaN, Infinity, '3' as unknown as number, null as unknown as number]) {
    assert.equal(canEnterStep(junk as number, done).ok, false, `junk step rejected: ${String(junk)}`);
  }
});

// Counts arriving as strings (PostgREST bigint) must not derail the gate.
check(() => {
  const c = toCounts({ jobs_complete: '1', checks_total: '24', matches_total: '24', needs_attention: '0', bogus: 'x' });
  assert.equal(c.checks_total, 24);
  assert.equal(c.needs_attention, 0);
  assert.equal(deriveBatchSteps(c, 'open').current_step, 4);
  // Negative or junk values clamp to 0 instead of unlocking a step.
  assert.equal(toCounts({ checks_total: -5, matches_total: 'nope' }).checks_total, 0);
});

// The payload the Continue Reconciliation card renders.
check(() => {
  const payload = toBatchPayload(
    {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      realm_id: '9130350',
      company_name: 'ABC Construction LLC',
      account_name: 'Operating Checking',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      period_label: null,
      status: 'open',
      created_at: 'x',
      updated_at: 'y',
    },
    counts({ jobs_complete: 1, checks_total: 40, matches_total: 40, needs_attention: 24, matched: 16 })
  );
  assert.equal(payload.summary.heading, 'ABC Construction LLC · Operating Checking');
  assert.equal(payload.summary.period, 'August 2026');
  assert.equal(payload.summary.step_label, 'Step 3 of 4');
  assert.equal(payload.summary.attention_label, '24 checks need attention');
  assert.equal(payload.state.current_step, 3);
});

check(() => {
  assert.equal(periodLabel('2026-08-01'), 'August 2026');
  assert.equal(
    toBatchPayload(
      {
        id: 'a', tenant_id: 'b', realm_id: 'c', period_start: '2026-01-01',
        period_end: '2026-01-31', status: 'open', created_at: '', updated_at: '',
      },
      counts({ jobs_complete: 1, checks_total: 1, matches_total: 1, needs_attention: 1 })
    ).summary.attention_label,
    '1 check needs attention'
  );
});

// A write that RLS silently dropped comes back as no row. That must throw, not
// be reported as a success with an empty batch.
check(() => {
  for (const bad of [null, undefined, {}, { id: 'x' }, { id: 'x', tenant_id: 't' }]) {
    assert.throws(() => toBatchPayload(bad as any, counts()), /did not persist/);
  }
});

console.log(`batches: ${n} step-gating assertion groups passed (pure logic)`);

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — RLS and schema. Needs a live database.
// ─────────────────────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey) {
  console.log(
    'batches: SKIPPING the live-DB half — set NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g. `npx dotenv -e ../.env -- npx tsx lib/batches.check.ts`) ' +
      'to assert that an anon-key request returns zero rows.'
  );
} else {
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const MISSING = /PGRST202|PGRST205|42P01|42883/;

    let failures = 0;

    // Does the table actually exist? Only the service key can answer: with the
    // anon key, "absent" and "RLS is working" look identical.
    let tableKnownPresent: boolean | null = null;
    if (serviceKey) {
      const service = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { error } = await service.from('batches').select('id').limit(1);
      if (MISSING.test(String(error?.code || ''))) {
        tableKnownPresent = false;
      } else if (error) {
        console.error(`batches: service-key probe errored: ${error.code} ${error.message}`);
        failures++;
      } else {
        tableKnownPresent = true;
      }

      // The derived-state objects must exist too, or the endpoints 503.
      for (const fn of ['batch_counts', 'batch_counts_many', 'batch_can_complete'] as const) {
        const args =
          fn === 'batch_counts_many'
            ? { p_batch_ids: [] as string[] }
            : { p_batch_id: '00000000-0000-0000-0000-000000000000' };
        const { error: fnErr } = await service.rpc(fn, args as any);
        if (MISSING.test(String(fnErr?.code || ''))) {
          console.log(`batches: SKIP public.${fn}() — not present (migration 032 not applied)`);
        } else if (fnErr) {
          failures++;
          console.error(`batches: FAIL public.${fn}() errored: ${fnErr.code} ${fnErr.message}`);
        } else {
          console.log(`batches: ok public.${fn}() present`);
        }
      }
    }

    // The anon read. Zero rows only counts as RLS when the table is known to be
    // there.
    const { data, error } = await anon.from('batches').select('*').limit(5);
    const rows = data?.length ?? 0;
    const code = String(error?.code || '');

    if (MISSING.test(code) || tableKnownPresent === false) {
      console.log(
        'batches: SKIP the RLS assertion — the batches table is NOT present in this ' +
          'database, and a missing table returns zero rows for every caller. ' +
          'Apply supabase/migrations/032_batches.sql and re-run. ' +
          'This is NOT a pass.'
      );
    } else if (rows > 0) {
      failures++;
      console.error(`batches: FAIL batches returned ${rows} row(s) to the anon key`);
    } else if (tableKnownPresent === true) {
      console.log('batches: ok batches -> 0 rows for anon, and the table is confirmed present (RLS holds)');
    } else {
      console.log(
        'batches: PARTIAL batches -> 0 rows for anon, but without ' +
          'SUPABASE_SERVICE_ROLE_KEY this cannot be told apart from the table being ' +
          'absent. Set it to turn this into a real assertion.'
      );
    }

    // A write must be refused too, not just a read.
    const { error: writeErr } = await anon.from('batches').insert({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      realm_id: 'rls-probe',
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });
    if (MISSING.test(String(writeErr?.code || '')) || tableKnownPresent === false) {
      console.log('batches: SKIP anon insert probe — batches not present');
    } else if (!writeErr) {
      failures++;
      console.error('batches: FAIL anon key was able to insert a batch');
    } else {
      console.log(`batches: ok anon insert into batches rejected (${writeErr.code || writeErr.message})`);
    }

    if (failures > 0) {
      console.error(`batches: ${failures} live-DB check(s) FAILED`);
      process.exit(1);
    }
    console.log('batches: live-DB half finished with no failures');
  })().catch((err) => {
    console.error('batches: live-DB half errored:', err?.message || err);
    process.exit(1);
  });
}
