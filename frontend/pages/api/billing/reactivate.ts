import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { stripeConfig, stripeRequest, StripeError } from '@/lib/billing/stripe';
import { loadBillingTenant } from '@/lib/billing/service';

/**
 * POST /api/billing/reactivate
 *
 * "Reactivation before that date" (CHECKLIST section 7). Switching renewal back
 * on is only possible while the paid period is still running; once
 * paid_through has passed, Stripe has ended the subscription and there is
 * nothing to un-cancel, so this answers 409 and points at a fresh checkout
 * rather than pretending.
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

  try {
    const tenant = await loadBillingTenant(ctx.tenantId);
    if (!tenant?.stripe_subscription_id) {
      return res.status(409).json({ error: 'no_subscription', message: 'There is no subscription to reactivate.' });
    }

    const paidThroughMs = tenant.paid_through ? new Date(tenant.paid_through).getTime() : null;
    if (tenant.subscription_status === 'canceled' || (paidThroughMs !== null && paidThroughMs <= Date.now())) {
      return res.status(409).json({
        error: 'past_paid_through',
        message:
          'The paid period has ended, so this subscription can no longer be reactivated. Start a new subscription instead.',
        paidThrough: tenant.paid_through ?? null,
        use: '/api/billing/checkout',
      });
    }
    if (tenant.cancel_at_period_end !== true) {
      return res.status(409).json({ error: 'not_cancelling', message: 'This subscription is already renewing.' });
    }

    const updated = await stripeRequest<any>(`/v1/subscriptions/${tenant.stripe_subscription_id}`, {
      config: cfg,
      idempotencyKey: `reactivate-${tenant.stripe_subscription_id}-${tenant.paid_through || 'none'}`,
      params: {
        cancel_at_period_end: false,
        metadata: { tenant_id: ctx.tenantId, reactivated_by: ctx.email || ctx.userId },
      },
    });

    return res.status(200).json({
      cancelAtPeriodEnd: updated?.cancel_at_period_end === true,
      status: updated?.status ?? null,
      paidThrough: tenant.paid_through ?? null,
      message: 'Renewal is back on.',
      note: 'Subscription state is persisted by the customer.subscription.updated webhook.',
    });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[billing/reactivate]', err?.message || err);
    return res.status(status).json({ error: 'reactivate_failed', message: err?.message || 'Reactivation failed.' });
  }
}
