import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { stripeConfig, stripeRequest, StripeError, stripeTime } from '@/lib/billing/stripe';
import { loadBillingTenant } from '@/lib/billing/service';

/**
 * POST /api/billing/cancel   { reason? }
 *
 * CHECKLIST section 7: "monthly ends at period end; annual disables renewal but
 * runs to the paid-through date; reactivation before that date; incurred
 * overages still payable."
 *
 * Both intervals are therefore the SAME Stripe call — cancel_at_period_end —
 * because that is exactly "stop renewing, keep what has been paid for". Nothing
 * here cancels immediately, and nothing here waives metered overage already
 * recorded in usage_ledger: that usage has been reported to Stripe and will
 * appear on the final invoice.
 *
 * The tenant row is not written here. customer.subscription.updated is the one
 * writer of subscription state.
 *
 * `billing.manage` — Administrators only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'billing.manage');
  if (!ctx) return;

  const cfg = stripeConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'stripe_not_configured', message: cfg.reason, missing: cfg.missing });
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;

  try {
    const tenant = await loadBillingTenant(ctx.tenantId);
    if (!tenant?.stripe_subscription_id) {
      return res.status(409).json({ error: 'no_subscription', message: 'There is no subscription to cancel.' });
    }
    if (tenant.cancel_at_period_end === true) {
      return res.status(409).json({
        error: 'already_cancelling',
        message: 'Renewal is already switched off for this subscription.',
        paidThrough: tenant.paid_through ?? null,
      });
    }

    const updated = await stripeRequest<any>(`/v1/subscriptions/${tenant.stripe_subscription_id}`, {
      config: cfg,
      idempotencyKey: `cancel-${tenant.stripe_subscription_id}`,
      params: {
        cancel_at_period_end: true,
        cancellation_details: reason ? { comment: reason } : undefined,
        metadata: { tenant_id: ctx.tenantId, cancelled_by: ctx.email || ctx.userId },
      },
    });

    const paidThrough =
      stripeTime(updated?.current_period_end) ??
      stripeTime(updated?.cancel_at) ??
      tenant.paid_through ??
      null;

    return res.status(200).json({
      cancelAtPeriodEnd: updated?.cancel_at_period_end === true,
      paidThrough,
      interval: tenant.billing_frequency ?? null,
      message:
        tenant.billing_frequency === 'annual'
          ? 'Renewal is off. The subscription runs to the paid-through date and can be reactivated before then.'
          : 'Renewal is off. The subscription ends at the end of the current period and can be reactivated before then.',
      overageNote: 'Overage already recorded this period is still payable on the final invoice.',
      note: 'Subscription state is persisted by the customer.subscription.updated webhook.',
    });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[billing/cancel]', err?.message || err);
    return res.status(status).json({ error: 'cancel_failed', message: err?.message || 'Cancellation failed.' });
  }
}
