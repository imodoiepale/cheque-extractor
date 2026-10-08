import type { NextApiRequest, NextApiResponse } from 'next';
import {
  readRawBody,
  stripeConfig,
  stripeRequest,
  verifyStripeSignature,
  StripeError,
  stripeTime,
  idOf,
} from '@/lib/billing/stripe';
import { planFromPriceId, type PlanKey } from '@/lib/billing/plans';
import {
  intervalOfPrice,
  service,
  splitSubscriptionItems,
  tenantIdForStripeObject,
} from '@/lib/billing/service';
import { annualEnabled, createAnnualSubscription } from '@/lib/billing/annual';

/**
 * POST /api/billing/webhook — the eight Stripe events (CHECKLIST section 7).
 *
 *   checkout.session.completed
 *   customer.subscription.created / .updated / .deleted
 *   invoice.created / .finalized / .paid / .payment_failed
 *
 * Three rules this file exists to enforce:
 *
 *  1. SIGNATURE FIRST. The body is read raw (bodyParser is off below) and
 *     verified before it is parsed. An unsigned body is an attacker claiming a
 *     firm has paid, so it never reaches a parser, let alone the database.
 *
 *  2. IDEMPOTENT BY CONSTRAINT. begin_stripe_event() (migration 033) inserts
 *     the event id as a PRIMARY KEY and tells us 'new' | 'retry' |
 *     'duplicate'. A duplicate returns 200 and does nothing — Stripe retries
 *     are routine, not exceptional. A 'retry' (an attempt that crashed before
 *     it finished) IS reprocessed, because every handler below is a write that
 *     can be applied twice safely: upserts keyed on the Stripe id, and
 *     apply_stripe_subscription(), which sets state to what Stripe says rather
 *     than incrementing anything.
 *
 *  3. ACCESS IS GRANTED ONLY HERE. apply_stripe_subscription() is service-role
 *     only, so no browser route can call it. The Checkout success_url cannot
 *     activate a plan: it is a URL the customer can type.
 *
 * A handler that throws leaves processed_at NULL and answers 500, so Stripe
 * retries. That is deliberate: a swallowed webhook is a firm whose plan is
 * wrong with nothing in the logs.
 */
export const config = {
  api: {
    // Required: the signature is computed over the exact bytes Stripe sent.
    bodyParser: false,
  },
};

/** The eight events we act on. Anything else is recorded and ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
]);

/* ───────────────────────────── subscriptions ───────────────────────────── */

/**
 * Apply a Stripe subscription object to a tenant.
 *
 * The plan comes from the PRICE ID, resolved through the environment, not from
 * the object's metadata: metadata is whatever a client-created session said,
 * while the price id is what Stripe will actually charge. A tampered metadata
 * field must not be able to award a Scale allowance on an Essential price.
 */
async function applySubscription(tenantId: string, subscription: any, envName: 'test' | 'live') {
  const { base, metered } = splitSubscriptionItems(subscription);
  const resolved = planFromPriceId(idOf(base?.price) ?? base?.price?.id, envName);

  if (!resolved || resolved.kind === 'overage') {
    throw new Error(
      `Subscription ${subscription?.id}: base price ${idOf(base?.price) || '(none)'} does not match any ` +
        `${envName} plan price id. Refusing to guess a plan — check the STRIPE_PRICE_${envName.toUpperCase()}_* variables.`
    );
  }

  const interval = resolved.kind === 'annual' ? 'annual' : intervalOfPrice(base?.price) || 'monthly';
  const periodEnd =
    stripeTime(subscription?.current_period_end) ??
    // Flexible billing mode moves the period onto the item.
    stripeTime(base?.current_period_end);

  const { data, error } = await service().rpc('apply_stripe_subscription', {
    p_tenant_id: tenantId,
    p_customer_id: idOf(subscription?.customer),
    p_subscription_id: subscription?.id ?? null,
    p_plan: resolved.plan,
    p_frequency: interval,
    p_status: subscription?.status ?? null,
    p_paid_through: periodEnd,
    p_cancel_at_period_end: subscription?.cancel_at_period_end === true,
    p_cancel_at: stripeTime(subscription?.cancel_at),
    p_canceled_at: stripeTime(subscription?.canceled_at),
    p_started_at: stripeTime(subscription?.start_date) ?? stripeTime(subscription?.created),
  });
  if (error) throw error;

  if (!metered) {
    // Not fatal — the base plan is still correct — but overage would silently
    // never be charged, which is a revenue hole worth a loud log line.
    console.error(
      `[billing/webhook] subscription ${subscription?.id} has no metered item; overage cannot be billed`
    );
  }

  return data;
}

/* ──────────────────────────────── invoices ─────────────────────────────── */

function lineSummary(invoice: any) {
  const lines: any[] = invoice?.lines?.data || [];
  return lines.slice(0, 20).map((l) => ({
    description: l?.description ?? null,
    amount: l?.amount ?? null,
    quantity: l?.quantity ?? null,
    price_id: idOf(l?.price) ?? idOf(l?.pricing?.price_details?.price) ?? null,
    metered: l?.price?.recurring?.usage_type === 'metered' || !!l?.price?.recurring?.meter,
  }));
}

/**
 * Upsert the invoice row. Keyed on stripe_invoice_id, so invoice.created,
 * .finalized, .paid and .payment_failed for the same invoice all land on one
 * row and arriving out of order cannot produce two.
 */
async function upsertInvoice(tenantId: string, invoice: any) {
  const row = {
    tenant_id: tenantId,
    stripe_invoice_id: invoice.id,
    stripe_customer_id: idOf(invoice?.customer),
    stripe_subscription_id: idOf(invoice?.subscription) ?? idOf(invoice?.parent?.subscription_details?.subscription),
    number: invoice?.number ?? null,
    status: invoice?.status ?? 'draft',
    currency: invoice?.currency ?? 'usd',
    amount_due: invoice?.amount_due ?? 0,
    amount_paid: invoice?.amount_paid ?? 0,
    amount_remaining: invoice?.amount_remaining ?? 0,
    subtotal: invoice?.subtotal ?? null,
    total: invoice?.total ?? null,
    period_start: stripeTime(invoice?.period_start),
    period_end: stripeTime(invoice?.period_end),
    due_date: stripeTime(invoice?.due_date),
    paid_at:
      invoice?.status === 'paid'
        ? stripeTime(invoice?.status_transitions?.paid_at) ?? new Date().toISOString()
        : null,
    attempt_count: invoice?.attempt_count ?? null,
    next_payment_attempt: stripeTime(invoice?.next_payment_attempt),
    hosted_invoice_url: invoice?.hosted_invoice_url ?? null,
    invoice_pdf: invoice?.invoice_pdf ?? null,
    line_summary: lineSummary(invoice),
    updated_at: new Date().toISOString(),
  };

  const { error } = await service()
    .from('billing_invoices')
    .upsert(row, { onConflict: 'stripe_invoice_id' });
  if (error) throw error;
}

/**
 * Mirror the invoice outcome onto the tenant.
 *
 * On failure this records the warning window ONLY. It does not restrict
 * processing: the grace period is Stripe's own dunning schedule, and when
 * Stripe gives up it sends customer.subscription.updated with status past_due,
 * which tenant_usage_state() (029) already turns into processing_allowed =
 * false while every read path stays open. Inventing a second grace clock here
 * would mean two answers to "is this firm restricted".
 */
async function applyInvoiceToTenant(tenantId: string, invoice: any) {
  const patch: Record<string, any> = {
    payment_status: invoice?.status === 'open' && (invoice?.attempt_count ?? 0) > 0 ? 'failed' : invoice?.status ?? null,
    stripe_synced_at: new Date().toISOString(),
  };

  if (invoice?.status === 'paid') {
    patch.payment_grace_until = null;
    const periodEnd = stripeTime(invoice?.period_end) ?? stripeTime(invoice?.lines?.data?.[0]?.period?.end);
    if (periodEnd) patch.paid_through = periodEnd;
  } else if (invoice?.next_payment_attempt) {
    patch.payment_grace_until = stripeTime(invoice.next_payment_attempt);
  }

  const { error } = await service().from('tenants').update(patch).eq('id', tenantId);
  if (error) throw error;
}

/* ────────────────────────── checkout completion ────────────────────────── */

async function handleCheckoutCompleted(tenantId: string, session: any, envName: 'test' | 'live') {
  // Monthly: the subscription already exists. Fetch it from Stripe rather than
  // trusting the session body, then apply it.
  if (session?.mode === 'subscription') {
    const subId = idOf(session?.subscription);
    if (!subId) throw new Error(`checkout.session.completed ${session?.id} has no subscription to apply`);
    const subscription = await stripeRequest<any>(`/v1/subscriptions/${subId}`, {
      method: 'GET',
      params: { expand: ['items.data.price'] },
    });
    return applySubscription(tenantId, subscription, envName);
  }

  // Annual, step 2 of 2: a card has been saved, now create the mixed-interval
  // subscription. See lib/billing/annual.ts — this path is unverified.
  if (session?.mode === 'setup') {
    const plan = session?.metadata?.plan as PlanKey | undefined;
    if (!plan) throw new Error(`setup session ${session?.id} carries no plan in metadata`);

    if (!annualEnabled()) {
      console.error(
        `[billing/webhook] setup session ${session?.id} completed for annual ${plan}, but ` +
          'STRIPE_ANNUAL_ENABLED is not true. The card is saved; no subscription was created.'
      );
      return { skipped: 'annual_disabled' };
    }

    const setupIntentId = idOf(session?.setup_intent);
    let paymentMethodId: string | null = null;
    if (setupIntentId) {
      const si = await stripeRequest<any>(`/v1/setup_intents/${setupIntentId}`, { method: 'GET' });
      paymentMethodId = idOf(si?.payment_method);
    }

    const customerId = idOf(session?.customer);
    if (!customerId) throw new Error(`setup session ${session?.id} has no customer`);

    if (paymentMethodId) {
      await stripeRequest(`/v1/customers/${customerId}`, {
        params: { invoice_settings: { default_payment_method: paymentMethodId } },
      });
    }

    const subscription = await createAnnualSubscription({
      tenantId,
      customerId,
      plan,
      paymentMethodId,
      cfg: stripeConfig(),
    });

    // customer.subscription.created will also arrive; applying here as well is
    // safe because apply_stripe_subscription() sets state rather than
    // incrementing it.
    return applySubscription(tenantId, subscription, envName);
  }

  return { skipped: `unhandled_mode_${session?.mode}` };
}

/* ───────────────────────────────── handler ─────────────────────────────── */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const cfg = stripeConfig();
  // Note: cfg.configured also requires every price id. Signature verification
  // only needs the webhook secret, so the secret is checked on its own —
  // otherwise a missing price id would make us reject genuine Stripe events.
  if (!cfg.webhookSecret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET is not set; rejecting delivery');
    return res.status(503).json({ error: 'webhook_not_configured' });
  }

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (err: any) {
    return res.status(400).json({ error: 'unreadable_body', message: err?.message });
  }

  try {
    verifyStripeSignature(raw, req.headers['stripe-signature'], cfg.webhookSecret);
  } catch (err: any) {
    const status = err instanceof StripeError ? err.status : 400;
    console.error('[billing/webhook] signature rejected:', err?.message);
    return res.status(status).json({ error: 'signature_invalid' });
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const eventId: string = event?.id;
  const type: string = event?.type || 'unknown';
  if (!eventId) return res.status(400).json({ error: 'missing_event_id' });

  const svc = service();

  // Claim the event. The PRIMARY KEY on stripe_events is the idempotency.
  const { data: claim, error: claimError } = await svc.rpc('begin_stripe_event', {
    p_event_id: eventId,
    p_type: type,
    p_payload: event,
    p_livemode: event?.livemode ?? null,
    p_api_version: event?.api_version ?? null,
  });

  if (claimError) {
    // Cannot establish idempotency -> do not process. A 500 makes Stripe retry,
    // which is the right outcome; applying the event blind is not.
    console.error('[billing/webhook] begin_stripe_event failed:', claimError.message);
    return res.status(500).json({ error: 'event_claim_failed', message: claimError.message });
  }

  if (claim === 'duplicate') {
    return res.status(200).json({ received: true, duplicate: true, eventId });
  }

  if (!HANDLED.has(type)) {
    await svc.rpc('finish_stripe_event', { p_event_id: eventId, p_tenant_id: null, p_error: null });
    return res.status(200).json({ received: true, ignored: type });
  }

  const object = event?.data?.object ?? {};

  try {
    const tenantId = await tenantIdForStripeObject(object);
    if (!tenantId) {
      // Recorded, not applied. Guessing which firm a payment belongs to is how
      // the wrong firm gets activated.
      await svc.rpc('finish_stripe_event', {
        p_event_id: eventId,
        p_tenant_id: null,
        p_error: null,
      });
      console.error(`[billing/webhook] ${type} ${eventId}: no tenant could be attributed; skipped`);
      return res.status(200).json({ received: true, skipped: 'tenant_unresolved' });
    }

    switch (type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(tenantId, object, cfg.env);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await applySubscription(tenantId, object, cfg.env);
        break;

      case 'customer.subscription.deleted': {
        // Ended for real (the period has run out). Cancellation that merely
        // disables renewal arrives as .updated with cancel_at_period_end.
        const { error } = await svc
          .from('tenants')
          .update({
            subscription_status: 'canceled',
            cancel_at_period_end: false,
            canceled_at: stripeTime(object?.canceled_at) ?? new Date().toISOString(),
            paid_through: stripeTime(object?.current_period_end) ?? null,
            stripe_synced_at: new Date().toISOString(),
          })
          .eq('id', tenantId);
        if (error) throw error;
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await upsertInvoice(tenantId, object);
        await applyInvoiceToTenant(tenantId, object);
        break;
    }

    await svc.rpc('finish_stripe_event', { p_event_id: eventId, p_tenant_id: tenantId, p_error: null });
    return res.status(200).json({ received: true, eventId, type, retry: claim === 'retry' });
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 2000);
    console.error(`[billing/webhook] ${type} ${eventId} failed:`, message);
    // processed_at stays NULL, so Stripe's retry is allowed to reprocess.
    try {
      await svc.rpc('finish_stripe_event', { p_event_id: eventId, p_tenant_id: null, p_error: message });
    } catch (stampError: any) {
      console.error('[billing/webhook] could not record the failure:', stampError?.message);
    }
    return res.status(500).json({ error: 'event_processing_failed', eventId, message });
  }
}
