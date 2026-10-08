import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { PLANS, overageEstimate, planByKey } from '@/lib/billing/plans';
import { stripeConfig, stripeRequest, idOf } from '@/lib/billing/stripe';
import { annualEnabled } from '@/lib/billing/annual';
import { isMissingSchema, loadBillingTenant, service } from '@/lib/billing/service';

/**
 * GET /api/billing/subscription
 *
 * The one read model the billing page uses for everything Stripe owns: payment
 * status, paid-through date, payment method, invoice history, and which of the
 * change-plan / cancel / reactivate controls are legal right now.
 *
 * Every field is either read from a row Stripe's verified webhook wrote, or is
 * null. In particular `invoices` is rows from billing_invoices — a month with
 * no invoice row produces no entry. The page this replaces derived "Paid" from
 * an array index; there is no code path here that can do that.
 *
 * `billing.view` — Administrators only (lib/roles.ts).
 */

/** Stripe's invoice status -> something a human reads, mapped once, server-side. */
const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Awaiting payment',
  paid: 'Settled',
  uncollectible: 'Uncollectible',
  void: 'Voided',
  failed: 'Payment failed',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const ctx = await requireCapability(req, res, 'billing.view');
  if (!ctx) return;

  const cfg = stripeConfig();
  const stripeBlock = {
    configured: cfg.configured,
    env: cfg.env,
    annualEnabled: annualEnabled(),
    reason: cfg.reason,
    missing: cfg.missing,
  };

  let tenant;
  try {
    tenant = await loadBillingTenant(ctx.tenantId);
  } catch (err: any) {
    console.error('[billing/subscription] tenant read failed', err?.message);
    return res.status(500).json({ error: 'server_error', message: err?.message });
  }

  // 033 unapplied, or no tenant row: say so rather than render blanks that read
  // as "nothing owed".
  if (!tenant || tenant.cancel_at_period_end === undefined) {
    return res.status(200).json({
      schemaPresent: false,
      stripe: stripeBlock,
      message:
        'The Stripe billing columns are not present in this database. Apply supabase/migrations/033_stripe_billing.sql.',
      plans: PLANS,
      subscription: null,
      invoices: [],
      paymentMethod: null,
      controls: { canChangePlan: false, canCancel: false, canReactivate: false },
    });
  }

  const svc = service();

  /* ── usage, from the same resolver the processing gate enforces ───────── */
  let usage: Record<string, any> | null = null;
  const stateRes = await svc.rpc('tenant_usage_state', { p_tenant_id: ctx.tenantId });
  if (stateRes.error) {
    if (!isMissingSchema(stateRes.error)) {
      console.error('[billing/subscription] tenant_usage_state failed', stateRes.error.message);
    }
  } else if (stateRes.data && typeof stateRes.data === 'object') {
    usage = stateRes.data as Record<string, any>;
  }

  /* ── invoice history: rows or nothing ────────────────────────────────── */
  let invoices: any[] = [];
  const invRes = await svc
    .from('billing_invoices')
    .select(
      'stripe_invoice_id, number, status, currency, total, amount_due, amount_paid, period_start, period_end, due_date, paid_at, hosted_invoice_url, invoice_pdf, next_payment_attempt, line_summary'
    )
    .eq('tenant_id', ctx.tenantId)
    .order('period_start', { ascending: false })
    .limit(36);

  if (invRes.error && !isMissingSchema(invRes.error)) {
    console.error('[billing/subscription] invoice read failed', invRes.error.message);
  }
  invoices = (invRes.data || []).map((inv: any) => ({
    id: inv.stripe_invoice_id,
    number: inv.number,
    status: inv.status,
    statusLabel: INVOICE_STATUS_LABEL[inv.status] ?? inv.status,
    currency: inv.currency,
    // Minor units out of Stripe; the page formats, it does not convert.
    totalMinor: inv.total ?? inv.amount_due ?? 0,
    amountPaidMinor: inv.amount_paid ?? 0,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    dueDate: inv.due_date,
    settledAt: inv.paid_at,
    hostedUrl: inv.hosted_invoice_url,
    pdfUrl: inv.invoice_pdf,
    nextPaymentAttempt: inv.next_payment_attempt,
    lines: Array.isArray(inv.line_summary) ? inv.line_summary : [],
  }));

  /* ── payment method, live from Stripe (we store no card data) ─────────── */
  let paymentMethod: any = null;
  if (cfg.configured && tenant.stripe_customer_id) {
    try {
      const customer = await stripeRequest<any>(`/v1/customers/${tenant.stripe_customer_id}`, {
        method: 'GET',
        config: cfg,
        params: { expand: ['invoice_settings.default_payment_method'] },
      });
      const pm = customer?.invoice_settings?.default_payment_method;
      if (pm && typeof pm === 'object') {
        paymentMethod = {
          id: pm.id,
          type: pm.type ?? null,
          brand: pm.card?.brand ?? null,
          last4: pm.card?.last4 ?? null,
          expMonth: pm.card?.exp_month ?? null,
          expYear: pm.card?.exp_year ?? null,
        };
      } else if (idOf(pm)) {
        paymentMethod = { id: idOf(pm), type: null, brand: null, last4: null, expMonth: null, expYear: null };
      }
    } catch (err: any) {
      // A Stripe outage must not take the page down; the field reads unknown.
      console.error('[billing/subscription] payment method lookup failed', err?.message);
    }
  }

  const plan = planByKey(tenant.plan);
  const frequency = tenant.billing_frequency ?? null;
  const used = Number(usage?.checks_used_this_period ?? 0);
  const over = overageEstimate(tenant.plan, used);

  const paidThroughMs = tenant.paid_through ? new Date(tenant.paid_through).getTime() : null;
  const stillInPaidPeriod = paidThroughMs !== null && paidThroughMs > Date.now();
  const subscribed = !!tenant.stripe_subscription_id;

  return res.status(200).json({
    schemaPresent: true,
    stripe: stripeBlock,
    plans: PLANS,

    subscription: {
      plan: tenant.plan ?? null,
      planName: plan?.name ?? null,
      billingFrequency: frequency,
      // Base price for the frequency actually being billed; null when unknown
      // rather than guessed from the plan.
      basePrice: plan ? (frequency === 'annual' ? plan.annual : frequency === 'monthly' ? plan.monthly : null) : null,
      commitment: frequency === 'annual' ? '12 months, paid up front' : frequency === 'monthly' ? 'Month to month' : null,
      renewalTerms:
        frequency === 'annual'
          ? 'Renews annually on the same date. The cheque allowance resets every month.'
          : frequency === 'monthly'
            ? 'Renews on the same date each month.'
            : null,

      status: tenant.subscription_status ?? null,
      paymentStatus: tenant.payment_status ?? null,
      paymentGraceUntil: tenant.payment_grace_until ?? null,
      paidThrough: tenant.paid_through ?? null,
      cancelAtPeriodEnd: tenant.cancel_at_period_end === true,
      cancelAt: tenant.cancel_at ?? null,
      canceledAt: tenant.canceled_at ?? null,
      // Rendered as the cancellation state the Super Admin view also shows.
      cancellationStatus:
        tenant.subscription_status === 'canceled'
          ? 'ended'
          : tenant.cancel_at_period_end === true
            ? 'renewal_disabled'
            : subscribed
              ? 'active'
              : null,

      includedChecks: tenant.plan_check_allowance ?? plan?.includedChecks ?? null,
      checksUsedThisPeriod: usage ? used : null,
      checksRemaining: usage?.checks_remaining ?? null,
      periodStart: usage?.billing_period_start ?? null,
      periodEnd: usage?.billing_period_end ?? null,
      overage: { units: over.units, rate: over.rate, estimateUsd: over.amount },

      stripeCustomerId: tenant.stripe_customer_id ?? null,
      stripeSubscriptionId: tenant.stripe_subscription_id ?? null,
      syncedAt: tenant.stripe_synced_at ?? null,
    },

    invoices,
    paymentMethod,

    controls: {
      // Nothing is offered that the server would refuse.
      canChangePlan: cfg.configured && subscribed && tenant.subscription_status !== 'canceled',
      canCancel: cfg.configured && subscribed && tenant.cancel_at_period_end !== true,
      canReactivate: cfg.configured && subscribed && tenant.cancel_at_period_end === true && stillInPaidPeriod,
      canSubscribeMonthly: cfg.configured && !subscribed,
      canSubscribeAnnual: cfg.configured && !subscribed && annualEnabled(),
    },

    usage: usage
      ? {
          processingAllowed: usage.processing_allowed === true,
          blockReason: usage.block_reason ?? null,
          isComped: usage.is_comped === true,
        }
      : null,
  });
}
