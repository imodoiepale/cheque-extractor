import type { AdminFn } from './index';
import { selectAll, stripeGet, stripeOn } from './_shared';

interface Sub { id: string; customer: string }

/** READ ONLY: reports which active Stripe subscriptions map to a tenant. The webhook owns tenant writes. */
const stripeSync: AdminFn = async (_body, { db }) => {
  if (!stripeOn()) return { synced: 0, users_updated: 0, checked: 0, matched: 0, unmatched: 0, details: [], error: 'Stripe is not configured' };

  const subs: Sub[] = [];
  for (let after: string | undefined; ;) {
    const page = await stripeGet<{ data: Sub[]; has_more: boolean }>('/subscriptions', {
      status: 'active', limit: 100, ...(after ? { starting_after: after } : {}),
    });
    subs.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }

  const tenants = await selectAll<{ id: string; stripe_customer_id: string }>((a, b) =>
    db.from('tenants').select('id, stripe_customer_id').not('stripe_customer_id', 'is', null).range(a, b));
  const byCustomer = new Map(tenants.map((t) => [t.stripe_customer_id, t.id]));

  const details = subs.map((s) => {
    const tenantId = byCustomer.get(s.customer) ?? null;
    return { stripe_id: s.id, customer_id: s.customer, user_id: tenantId, tenant_id: tenantId, action: tenantId ? 'matched' : 'unmatched' };
  });
  const matched = details.filter((d) => d.tenant_id).length;

  return { synced: subs.length, users_updated: 0, checked: subs.length, matched, unmatched: subs.length - matched, details };
};

export default stripeSync;
