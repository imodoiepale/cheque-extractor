import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { isInterval, isPlanKey, planByKey } from '@/lib/billing/plans';
import { stripeConfig, stripeRequest, StripeError, stripeTime, idOf } from '@/lib/billing/stripe';
import { annualEnabled, ANNUAL_UNVERIFIED_MESSAGE } from '@/lib/billing/annual';
import { loadBillingTenant, priceIdsFor, splitSubscriptionItems } from '@/lib/billing/service';

/**
 * POST /api/billing/plan-change
 *
 *   { plan, interval?, preview: true }               -> what it will cost
 *   { plan, interval?, confirm: true, acknowledgedTotalMinor }  -> apply it
 *
 * "Plan changes with charges, credits and effective dates disclosed before
 * confirmation" (CHECKLIST section 7). That is enforced here, not asked of the
 * UI: an apply call must carry `acknowledgedTotalMinor`, the figure the preview
 * returned. The server re-previews and refuses with 409 if the number has
 * moved, so a customer can never be charged a total they were not shown.
 *
 * Upgrades are immediate and prorated; downgrades are also immediate with a
 * prorated credit, because Stripe's proration is what produces the disclosed
 * numbers and deferring the change would mean disclosing figures for a date
 * that has not arrived.
 *
 * `billing.manage` — Administrators only.
 */
function sumLines(preview: any) {
  const lines: any[] = preview?.lines?.data || [];
  let charges = 0;
  let credits = 0;
  for (const line of lines) {
    const amount = Number(line?.amount ?? 0);
    if (amount >= 0) charges += amount;
    else credits += amount;
  }
  return { charges, credits };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'billing.manage');
  if (!ctx) return;

  const body = (req.body || {}) as {
    plan?: string;
    interval?: string;
    preview?: boolean;
    confirm?: boolean;
    acknowledgedTotalMinor?: number;
  };

  if (!isPlanKey(body.plan)) {
    return res.status(400).json({ error: 'invalid_plan', message: 'plan must be essential, professional or scale.' });
  }
  const plan = body.plan;

  const cfg = stripeConfig();
  if (!cfg.configured) {
    return res.status(503).json({ error: 'stripe_not_configured', message: cfg.reason, missing: cfg.missing });
  }

  try {
    const tenant = await loadBillingTenant(ctx.tenantId);
    if (!tenant?.stripe_subscription_id) {
      return res.status(409).json({
        error: 'no_subscription',
        message: 'There is no Stripe subscription to change. Subscribe first.',
      });
    }

    const subscription = await stripeRequest<any>(`/v1/subscriptions/${tenant.stripe_subscription_id}`, {
      method: 'GET',
      config: cfg,
      params: { expand: ['items.data.price'] },
    });

    const { base } = splitSubscriptionItems(subscription);
    if (!base?.id) {
      return res.status(409).json({
        error: 'subscription_shape_unexpected',
        message: 'The subscription has no base plan item to change.',
      });
    }

    const requestedInterval = isInterval(body.interval)
      ? body.interval
      : (tenant.billing_frequency as 'monthly' | 'annual' | null) || 'monthly';

    if (requestedInterval === 'annual' && !annualEnabled()) {
      return res.status(501).json({ error: 'annual_not_verified', message: ANNUAL_UNVERIFIED_MESSAGE });
    }

    const { base: newPriceId } = priceIdsFor(plan, requestedInterval, cfg);
    if (idOf(base.price) === newPriceId) {
      return res.status(409).json({
        error: 'already_on_plan',
        message: `This firm is already on ${planByKey(plan)?.name} ${requestedInterval}.`,
      });
    }

    const changeItems = [{ id: base.id, price: newPriceId, quantity: 1 }];

    /* ── Disclosure. Always computed, even on an apply call. ───────────── */
    const previewInvoice = await stripeRequest<any>('/v1/invoices/create_preview', {
      config: cfg,
      params: {
        customer: idOf(subscription.customer),
        subscription: subscription.id,
        subscription_details: {
          items: changeItems,
          proration_behavior: 'create_prorations',
          proration_date: Math.floor(Date.now() / 1000),
        },
      },
    });

    const { charges, credits } = sumLines(previewInvoice);
    const disclosure = {
      plan,
      planName: planByKey(plan)?.name ?? plan,
      interval: requestedInterval,
      currency: previewInvoice?.currency ?? 'usd',
      /* Minor units throughout: Stripe's own unit, no float conversion here. */
      chargesMinor: charges,
      creditsMinor: credits,
      dueNowMinor: Number(previewInvoice?.amount_due ?? 0),
      totalMinor: Number(previewInvoice?.total ?? 0),
      effectiveAt: new Date().toISOString(),
      nextInvoiceAt: stripeTime(previewInvoice?.next_payment_attempt) ?? stripeTime(previewInvoice?.period_end),
      lines: (previewInvoice?.lines?.data || []).slice(0, 20).map((l: any) => ({
        description: l?.description ?? null,
        amountMinor: Number(l?.amount ?? 0),
        period: { start: stripeTime(l?.period?.start), end: stripeTime(l?.period?.end) },
      })),
      allowanceNote:
        'The included cheque allowance resets monthly on both intervals; a plan change replaces the allowance from the next period boundary.',
    };

    if (!body.confirm) {
      return res.status(200).json({ preview: disclosure, applied: false });
    }

    /* ── Apply, but only against the figure the customer was shown. ────── */
    if (typeof body.acknowledgedTotalMinor !== 'number') {
      return res.status(400).json({
        error: 'disclosure_required',
        message: 'Confirming a plan change must echo acknowledgedTotalMinor from the preview.',
        preview: disclosure,
      });
    }
    if (body.acknowledgedTotalMinor !== disclosure.dueNowMinor) {
      return res.status(409).json({
        error: 'disclosure_stale',
        message:
          'The amount due has changed since it was shown. Nothing was charged — review the new figures and confirm again.',
        acknowledged: body.acknowledgedTotalMinor,
        preview: disclosure,
      });
    }

    const updated = await stripeRequest<any>(`/v1/subscriptions/${subscription.id}`, {
      config: cfg,
      idempotencyKey: `plan-change-${ctx.tenantId}-${plan}-${requestedInterval}-${disclosure.dueNowMinor}`,
      params: {
        items: changeItems,
        proration_behavior: 'create_prorations',
        metadata: { tenant_id: ctx.tenantId, plan, interval: requestedInterval },
      },
    });

    // The tenant row is NOT written here. customer.subscription.updated is the
    // single writer of plan and allowance, so one verified event is the only
    // thing that can move a firm between plans.
    return res.status(200).json({
      applied: true,
      preview: disclosure,
      subscriptionStatus: updated?.status ?? null,
      note: 'Applied at Stripe. The plan and allowance are updated by the customer.subscription.updated webhook.',
    });
  } catch (err: any) {
    const status = err instanceof StripeError ? (err.status >= 500 ? 502 : err.status) : 500;
    console.error('[billing/plan-change]', err?.message || err);
    return res.status(status).json({ error: 'plan_change_failed', message: err?.message || 'Plan change failed.' });
  }
}
