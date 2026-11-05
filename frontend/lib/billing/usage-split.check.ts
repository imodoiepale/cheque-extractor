/**
 * Runnable check: npx tsx lib/billing/usage-split.check.ts
 * Stripe may only ever see cheques above the allowance.
 */
import assert from 'node:assert';
import { splitUsage, type TenantBilling, type UsageRow } from './usage-split';

const PERIOD = '2026-11-01';
const row = (n: number, over: Partial<UsageRow> = {}): UsageRow => ({
  id: `r${String(n).padStart(3, '0')}`,
  quantity: 1,
  occurred_at: new Date(Date.UTC(2026, 10, 2, 0, n)).toISOString(),
  billing_period_start: PERIOD,
  stripe_event_id: null,
  ...over,
});
const tenant = (over: Partial<TenantBilling> = {}): TenantBilling => ({
  allowance: 3,
  subscriptionStartedAt: '2026-11-01T00:00:00Z',
  compGrants: [],
  ...over,
});
const metered = (d: ReturnType<typeof splitUsage>) =>
  d.reduce((sum, x) => sum + (x.action === 'meter' ? x.units : 0), 0);

// Inside the allowance nothing is billed; above it, each cheque is.
{
  const d = splitUsage([1, 2, 3, 4, 5].map((n) => row(n)), tenant());
  assert.deepStrictEqual(d.map((x) => x.action), ['stamp', 'stamp', 'stamp', 'meter', 'meter']);
  assert.strictEqual(metered(d), 2);
}

// Rows already counted in an earlier run use up the allowance.
{
  const d = splitUsage([
    row(1, { stripe_event_id: 'included' }),
    row(2, { stripe_event_id: 'included' }),
    row(3, { stripe_event_id: 'included' }),
    row(4),
  ], tenant());
  assert.strictEqual(metered(d), 1);
}

// A multi-cheque row crossing the line bills only the part above it.
{
  const d = splitUsage([row(1, { quantity: 5 })], tenant());
  assert.deepStrictEqual(d, [{ id: 'r001', action: 'meter', units: 2 }]);
}

// Each period has its own allowance.
{
  const d = splitUsage(
    [1, 2, 3, 4].map((n) => row(n)).concat([row(5, { billing_period_start: '2026-12-01' })]),
    tenant()
  );
  assert.strictEqual(metered(d), 1);
  assert.deepStrictEqual(d[4], { id: 'r005', action: 'stamp', stamp: 'included' });
}

// Usage before the subscription started never counts and never bills.
{
  const d = splitUsage(
    [row(1, { occurred_at: '2026-10-20T00:00:00Z' }), row(2)],
    tenant({ allowance: 1 })
  );
  assert.deepStrictEqual(d[0], { id: 'r001', action: 'stamp', stamp: 'trial' });
  assert.deepStrictEqual(d[1], { id: 'r002', action: 'stamp', stamp: 'included' });
}

// A firm that never subscribed is not billed at all.
{
  const d = splitUsage([row(1)], tenant({ subscriptionStartedAt: null }));
  assert.deepStrictEqual(d, [{ id: 'r001', action: 'stamp', stamp: 'trial' }]);
}

// Comp usage isn't billed, and billing resumes once the grant is revoked.
{
  const grant = { starts_at: '2026-11-01T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', revoked_at: '2026-11-02T00:02:30Z' };
  const d = splitUsage([1, 2, 3].map((n) => row(n)), tenant({ allowance: 0, compGrants: [grant] }));
  assert.deepStrictEqual(d.map((x) => x.action), ['stamp', 'stamp', 'meter']);
}

// An unknown allowance is held: not billed, and not written off.
{
  const d = splitUsage([row(1)], tenant({ allowance: null }));
  assert.deepStrictEqual(d, [{ id: 'r001', action: 'hold' }]);
}

// Run in two batches or one, the same number of cheques get billed.
{
  const all = [1, 2, 3, 4, 5, 6].map((n) => row(n));
  const first = splitUsage(all.slice(0, 4), tenant());
  const stamped = all.slice(0, 4).map((r) => ({ ...r, stripe_event_id: 'done' }));
  const second = splitUsage([...stamped, ...all.slice(4)], tenant());
  assert.strictEqual(metered(first) + metered(second), metered(splitUsage(all, tenant())));
}

console.log('usage-split check passed');
