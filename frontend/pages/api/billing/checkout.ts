import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { isPlanKey, planByKey } from '@/lib/billing/plans';
import { stripeConfig, stripeRequest, StripeError } from '@/lib/billing/stripe';
import { appOrigin, ensureCustomer, loadBillingTenant, priceIdsFor } from '@/lib/billing/service';

/**
 * POST /api/billing/checkout   { plan: 'essential'|'professional'|'scale' }
 *
 * Monthly plans go through Stripe Checkout (CHECKLIST section 7). The session
 * carries two line items: the monthly base price and the metered overage price,
 * so overage is billed on the same invoice rather than reconciled by hand.
 *
 * ANNUAL IS NOT ACCEPTED HERE and the 409 says why: an annual base with a
 * monthly metered overage is a mixed-interval subscription, which a standard
 * Checkout Session cannot create. That goes to /api/billing/subscribe-annual.
 *
 * This endpoint grants nothing. It returns a Stripe URL. Paid access is applied
 * only by the signature-verified webhook (apply_stripe_subscription, migration
 * 033, service role only) — the success_url below is attacker-controllable and
 * is treated as decoration.
 *
 * Administrators only: `billing.manage` (lib/roles.ts blocks Users).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'billing.manage');
  if (!ctx) return;

  const { plan, interval } = (req.body || {}) as { plan?: string; interval?: string };

  if (interval && interval !== 'monthly') {
    return res.status(409).json({
      error: 'interval_not_supported_here',
      message:
        'Checkout handles monthly subscriptions. An annual base plus monthly metered overage is a mixed-interval subscription, which a Checkout Session cannot create.',
      use: '/api/billing/subscribe-annual',
    });
  }

  if (!isPlanKey(plan)) {
    return res.status(400).json({ error: 'invalid_plan', message: 'plan must be essential, professional or scale.' });
  }

  const cfg = stripeConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'stripe_not_configured', message: cfg.reason, missing: cfg.missing });
  }

  try {
    const tenant = await loadBillingTenant(ctx.tenantId);
    if (!tenant) {
      return res.status(409).json({
        error: 'billing_schema_missing',
        message: 'The billing columns are not present in this database. Apply migrations 026–033.',
      });
    }
    if (tenant.subscription_status === 'active' && tenant.stripe_subscription_id) {
      return res.status(409).json({
        error: 'already_subscribed',
        message: 'This firm already has an active subscription. Use the change-plan flow instead.',
        use: '/api/billing/plan-change',
      });
    }

    const customerId = await ensureCustomer(tenant, ctx.email, cfg);
    const { base, overage } = priceIdsFor(plan, 'monthly', cfg);
    const origin = appOrigin();

    const session = await stripeRequest<any>('/v1/checkout/sessions', {
      config: cfg,
      // One in-flight checkout per tenant+plan: a double-clicked button must
      // not create two subscriptions.
      idempotencyKey: `checkout-${ctx.tenantId}-${plan}-monthly-${new Date().toISOString().slice(0, 13)}`,
      params: {
        mode: 'subscription',
        customer: customerId,
        client_reference_id: ctx.tenantId,
        line_items: [
          { price: base, quantity: 1 },
          // A metered price takes no quantity; usage arrives as meter events.
          { price: overage },
        ],
        subscription_data: {
          metadata: { tenant_id: ctx.tenantId, plan, interval: 'monthly' },
        },
        metadata: { tenant_id: ctx.tenantId, plan, interval: 'monthly' },
        // "confirming" — not "active". The page must not claim access here.
        success_url: `${origin}/billing?checkout=confirming&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      },
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      plan,
      interval: 'monthly',
      planName: planByKey(plan)?.name ?? plan,
      stripeEnv: cfg.env,
      note: 'Access is applied by the verified webhook, not by returning from Stripe.',
    });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[billing/checkout]', err?.message || err);
    return res.status(status).json({ error: 'checkout_failed', message: err?.message || 'Checkout failed.' });
  }
}
