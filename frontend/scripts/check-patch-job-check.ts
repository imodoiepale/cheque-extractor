/**
 * Regression check for Michael's lost approvals (17 Nov): the extension saves
 * three approvals at once, and each save wrote the whole cheque list back, so
 * only the last one kept its status.
 *
 *   cd frontend && npx tsx scripts/check-patch-job-check.ts
 */
import assert from 'node:assert/strict';
import { patchJobCheck } from '../lib/check-sync';

// One check_jobs row. Every write bumps updated_at, like trg_check_jobs_updated.
const row: any = {
  id: 1,
  job_id: 'job1',
  tenant_id: 't1',
  updated_at: 'v0',
  checks_data: [{ check_id: 'check_0001' }, { check_id: 'check_0002' }, { check_id: 'check_0003' }],
};
let version = 0;
const yieldNow = () => new Promise((r) => setTimeout(r, 0)); // lets the saves interleave

// Just enough of the supabase-js query builder for patchJobCheck.
function query() {
  const filters: [string, unknown][] = [];
  let values: any = null;
  const matches = () => filters.every(([k, v]) => row[k] === v);
  const q: any = {
    select: () => q,
    update: (v: any) => ((values = v), q),
    eq: (k: string, v: unknown) => (filters.push([k, v]), q),
    is: (k: string, v: unknown) => (filters.push([k, v]), q),
    maybeSingle: async () => {
      await yieldNow();
      return { data: matches() ? structuredClone(row) : null };
    },
    then: (resolve: any, reject: any) =>
      (async () => {
        await yieldNow();
        if (!matches()) return { data: [], error: null };
        Object.assign(row, structuredClone(values), { updated_at: `v${++version}` });
        return { data: [{ id: row.id }], error: null };
      })().then(resolve, reject),
  };
  return q;
}
const db = { from: () => query() };

const approve = (checkId: string) =>
  patchJobCheck(db, 't1', 'job1', checkId, (c) => ({ ...c, status: 'approved' }));

// frontend is CommonJS, so no top-level await.
async function main() {
  const saved = await Promise.all(['check_0001', 'check_0002', 'check_0003'].map(approve));
  assert.deepEqual(saved, [true, true, true]);
  assert.deepEqual(
    row.checks_data.map((c: any) => c.status),
    ['approved', 'approved', 'approved'],
    'a save that ran at the same time was overwritten'
  );
  console.log('ok  three approvals saved at once are all kept');

  assert.equal(await patchJobCheck(db, 't2', 'job1', 'check_0001', (c) => c), false);
  assert.equal(await patchJobCheck(db, 't1', 'job1', 'check_9999', (c) => c), false);
  console.log('ok  another tenant or an unknown cheque saves nothing');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
