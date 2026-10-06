import type { NextApiRequest, NextApiResponse } from 'next';
import { sendMeterEvent, stripeConfig, StripeError } from '@/lib/billing/stripe';
import { cronAuthorised, isMissingSchema, service } from '@/lib/billing/service';

/**
 * POST /api/billing/report-usage   (cron / operator)
 *
 * CHECKLIST section 8: "Reconcilable meter events submitted to Stripe; Kyriq
 * stays the source of truth for check-level detail, Stripe for subscription
 * state."
 *
 * Reads usage_ledger rows with stripe_event_id IS NULL (migration 027 has a
 * partial index for exactly this query), sends one meter event per row, then
 * stamps the row. Exactly-once comes from two independent places:
 *
 *   * Stripe's `identifier` is the ledger row id, so a re-send of the same row
 *     is deduplicated at Stripe.
 *   * usage_ledger's append-only trigger makes stripe_event_id write-once, so a
 *     row cannot be re-stamped with a different reference.
 *
 * Order is report-then-stamp on purpose. If the stamp fails, the next run
 * re-reports and Stripe discards the duplicate — a billing event seen twice is
 * free, a billing event never sent is revenue lost and a reconciliation that
 * never balances.
 *
 * Auth: BILLING_CRON_SECRET, compared in constant time. This endpoint moves
 * money, so it is not left open to anyone who finds the path.
 */
const DEFAULT_LIMIT = 500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!cronAuthorised(req)) {
    return res.status(401).json({ error: 'unauthorised', message: 'BILLING_CRON_SECRET required.' });
  }

  const cfg = stripeConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'stripe_not_configured', message: cfg.reason, missing: cfg.missing });
  }

  const limit = Math.min(Number(req.body?.limit) || DEFAULT_LIMIT, 2000);
  const svc = service();

  // Only tenants Stripe knows about. Trial and comp usage is recorded in the
  // ledger but has nothing to meter against, and reporting it would invoice a
  // firm that never subscribed.
  const { data: tenants, error: tenantError } = await svc
    .from('tenants')
    .select('id, stripe_customer_id, subscription_status')
    .not('stripe_customer_id', 'is', null);

  if (tenantError) {
    if (isMissingSchema(tenantError)) {
      return res.status(409).json({ error: 'billing_schema_missing', message: tenantError.message });
    }
    return res.status(500).json({ error: 'server_error', message: tenantError.message });
  }

  const customerByTenant = new Map<string, string>();
  for (const t of tenants || []) {
    if (t.stripe_customer_id) customerByTenant.set(t.id, t.stripe_customer_id);
  }
  if (customerByTenant.size === 0) {
    return res.status(200).json({ reported: 0, skipped: 0, failed: 0, message: 'No tenant has a Stripe customer yet.' });
  }

  const { data: rows, error: ledgerError } = await svc
    .from('usage_ledger')
    .select('id, tenant_id, quantity, occurred_at')
    .is('stripe_event_id', null)
    .in('tenant_id', [...customerByTenant.keys()])
    .order('occurred_at', { ascending: true })
    .limit(limit);

  if (ledgerError) {
    if (isMissingSchema(ledgerError)) {
      return res.status(409).json({ error: 'usage_ledger_missing', message: ledgerError.message });
    }
    return res.status(500).json({ error: 'server_error', message: ledgerError.message });
  }

  let reported = 0;
  let failed = 0;
  const errors: string[] = [];

  // ponytail: one HTTP call per ledger row. Ceiling — at 10,000 cheques a month
  // that is 10,000 calls, which is fine on a nightly run and is NOT fine if it
  // ever runs per-request. Upgrade path: aggregate per tenant per hour and use
  // `<tenant>:<hour>` as the identifier, which keeps Stripe-side dedup.
  for (const row of rows || []) {
    const customerId = customerByTenant.get(row.tenant_id);
    if (!customerId) continue;

    try {
      const event = await sendMeterEvent({
        customerId,
        identifier: row.id,
        value: row.quantity ?? 1,
        occurredAt: row.occurred_at ? new Date(row.occurred_at) : undefined,
        config: cfg,
      });

      // The only mutation migration 027 permits, and only for the service role.
      const { error: stampError } = await svc
        .from('usage_ledger')
        .update({
          stripe_event_id: event?.identifier || event?.id || row.id,
          stripe_reported_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .is('stripe_event_id', null);

      if (stampError) {
        // Reported but not stamped: next run re-reports and Stripe dedupes on
        // the identifier. Loud, because a persistent failure here means the
        // ledger stops agreeing with Stripe.
        console.error(`[billing/report-usage] ${row.id} reported but not stamped:`, stampError.message);
        errors.push(`${row.id}: ${stampError.message}`);
      }
      reported += 1;
    } catch (err: any) {
      failed += 1;
      const message = err instanceof StripeError ? `${err.code || err.status}: ${err.message}` : String(err?.message || err);
      errors.push(`${row.id}: ${message}`);
      // Keep going: one bad row must not stop the rest of the month.
    }
  }

  return res.status(failed > 0 ? 207 : 200).json({
    reported,
    failed,
    pending: (rows || []).length,
    stripeEnv: cfg.env,
    errors: errors.slice(0, 20),
  });
}
