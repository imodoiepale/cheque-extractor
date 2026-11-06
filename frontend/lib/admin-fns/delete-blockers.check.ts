/**
 * Runnable check: npx tsx lib/admin-fns/delete-blockers.check.ts
 * An account with billing history, a trial claim or teammates must never be deleted.
 */
import assert from 'node:assert';
import { deleteBlockers, type DeleteFacts } from './delete-blockers';

const clean: DeleteFacts = {
  isSuperAdmin: false,
  otherMembers: 0,
  stripeSubscriptionId: null,
  subscriptionStatus: 'trialing',
  usageRows: 0,
  invoices: 0,
  refunds: 0,
  trialClaims: 0,
};

assert.deepEqual(deleteBlockers(clean), [], 'a clean trial account can be deleted');

for (const over of [
  { isSuperAdmin: true },
  { otherMembers: 1 },
  { usageRows: 1 },
  { invoices: 1 },
  { refunds: 1 },
  { trialClaims: 1 },
  { stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
  { stripeSubscriptionId: 'sub_1', subscriptionStatus: 'past_due' },
  { stripeSubscriptionId: 'sub_1', subscriptionStatus: 'trialing' },
  { stripeSubscriptionId: 'sub_1', subscriptionStatus: null },
]) {
  assert.equal(deleteBlockers({ ...clean, ...over }).length, 1, `should block: ${JSON.stringify(over)}`);
}

for (const subscriptionStatus of ['canceled', 'expired']) {
  assert.deepEqual(deleteBlockers({ ...clean, stripeSubscriptionId: 'sub_1', subscriptionStatus }), [], 'an ended subscription does not block');
}

assert.equal(deleteBlockers({ ...clean, usageRows: 2, trialClaims: 1 }).length, 2, 'every reason is reported');

console.log('delete-blockers: ok');
