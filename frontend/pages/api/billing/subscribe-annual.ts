import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { isPlanKey, planByKey } from '@/lib/billing/plans';
import { stripeConfig, stripeRequest, StripeError } from '@/lib/billing/stripe';
import { appOrigin, ensureCustomer, loadBillingTenant, priceIdsFor } from '@/lib/billing/service';
import { ANNUAL_UNVERIFIED_MESSAGE, annualEnabled } from '@/lib/billing/annual';

/**
 * POST /api/billing/subscribe-annual   { plan }
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * UNVERIFIED AGAINST A REAL STRIPE ACCOUNT. Read this before shipping it.
 *
 * An annual base price plus a MONTHLY metered overage price is a mixed-interval
 * subscription. A standard Checkout Session cannot create one, so the checklist
 * routes annual through the Subscriptions API in flexible billing mode. That is
 * what this endpoint does, in two steps:
 *
 *   1. (this endpoint) Stripe Checkout in `mode: 'setup'` collects and saves a
 *      card. No subscription exists yet and no access is granted. The chosen
 *      plan travels in the session metadata.
 *   2. (webhook) `checkout.session.completed` with mode=setup attaches the
 *      payment method as the customer default and then creates the annual
 *      subscription with `billing_mode[type]=flexible`. The resulting
 *      `customer.subscription.created` event is what grants access.
 *
 * What is genuinely UNFINISHED, stated plainly rather than hidden:
 *
 *   * Whether Stripe accepts one subscription holding a yearly licensed item
 *     and a monthly metered item under flexible billing mode could not be
 *     confirmed here — there are no Stripe credentials in this environment, so
 *     the API was never called. If Stripe rejects the mixed interval, the
 *     fallback is two subscriptions (annual licensed + monthly metered) against
 *     the same customer, and the webhook's tenant resolution already copes with
 *     that because it keys on the customer; but `tenants.stripe_subscription_id`
 *     holds ONE id, so that fallback needs a second column before it works.
 *   * The proration and credit figures an annual mid-term plan change produces
 *     have never been observed.
 *
 * It is therefore OFF unless STRIPE_ANNUAL_ENABLED=true is set deliberately.
 * With the flag unset this returns 501 with that explanation, which is the
 * honest answer: the code exists, it has not been proven against Stripe.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'billing.manage');
  if (!ctx) return;

  const { plan } = (req.body || {}) as { plan?: string };
  if (!isPlanKey(plan)) {
    return res.status(400).json({ error: 'invalid_plan', message: 'plan must be essential, professional or scale.' });
  }

  if (!annualEnabled()) {
    return res.status(501).json({
      error: 'annual_not_verified',
      message: ANNUAL_UNVERIFIED_MESSAGE,
      plan,
      annualPrice: planByKey(plan)?.annual ?? null,
    });
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

    // Price ids are resolved now so a missing one fails before the customer is
    // sent to Stripe to enter a card.
    priceIdsFor(plan, 'annual', cfg);

    const customerId = await ensureCustomer(tenant, ctx.email, cfg);
    const origin = appOrigin();

    const session = await stripeRequest<any>('/v1/checkout/sessions', {
      config: cfg,
      idempotencyKey: `annual-setup-${ctx.tenantId}-${plan}-${new Date().toISOString().slice(0, 13)}`,
      params: {
        mode: 'setup',
        customer: customerId,
        client_reference_id: ctx.tenantId,
        currency: 'usd',
        // Step 2 reads these. The webhook re-reads the price id from the
        // environment, so metadata cannot promote a firm to a bigger plan.
        metadata: { tenant_id: ctx.tenantId, plan, interval: 'annual', flow: 'annual_setup' },
        setup_intent_data: {
          metadata: { tenant_id: ctx.tenantId, plan, interval: 'annual', flow: 'annual_setup' },
        },
        success_url: `${origin}/billing?checkout=confirming&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
      },
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      plan,
      interval: 'annual',
      planName: planByKey(plan)?.name ?? plan,
      stripeEnv: cfg.env,
      unverified: true,
      note:
        'Step 1 of 2: this only saves a card. The subscription is created by the verified webhook, ' +
        'and the mixed-interval shape has never been confirmed against Stripe.',
    });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[billing/subscribe-annual]', err?.message || err);
    return res
      .status(status)
      .json({ error: 'annual_subscribe_failed', message: err?.message || 'Could not start annual setup.' });
  }
}
