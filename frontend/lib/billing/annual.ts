/**
 * Annual subscriptions — the mixed-interval part, and the one piece of this
 * parcel that is NOT proven.
 *
 * An annual base price plus a MONTHLY metered overage price cannot be created
 * by a Checkout Session, so the checklist routes annual through the
 * Subscriptions API in flexible billing mode. `createAnnualSubscription()` is
 * that call. It has never run: there are no Stripe credentials in this
 * environment, so whether Stripe accepts a yearly licensed item and a monthly
 * metered item in ONE subscription under `billing_mode[type]=flexible` is
 * unconfirmed.
 *
 * Hence the flag. With STRIPE_ANNUAL_ENABLED unset, every annual path answers
 * 501 and says so, which is the honest state. Nothing here presents annual as
 * finished.
 */
import { stripeRequest, type StripeConfig } from './stripe';
import { priceIdsFor } from './service';
import type { PlanKey } from './plans';

export const ANNUAL_FLAG = 'STRIPE_ANNUAL_ENABLED';

export function annualEnabled(source: Record<string, string | undefined> = process.env as any): boolean {
  return (source[ANNUAL_FLAG] || '').trim().toLowerCase() === 'true';
}

export const ANNUAL_UNVERIFIED_MESSAGE =
  'Annual billing is built but unverified: an annual base plus monthly metered overage is a ' +
  'mixed-interval subscription that was never exercised against a real Stripe account. ' +
  `Set ${ANNUAL_FLAG}=true in an environment with Stripe credentials to enable it, and confirm the ` +
  'first subscription in the Stripe dashboard before offering annual to a customer.';

/**
 * Create the annual subscription after a card has been saved.
 *
 * Called from the webhook handler for `checkout.session.completed` with
 * mode=setup — never from a browser request, so a redirect cannot start a
 * subscription.
 *
 * `billing_mode[type]=flexible` is what permits per-item billing cadences. If
 * Stripe rejects the mixed interval, the error is allowed to propagate: the
 * webhook records it on the stripe_events row and leaves processed_at NULL, so
 * the failure is visible and Stripe's retry can succeed once the shape is
 * fixed. Swallowing it would leave a firm with a saved card and no
 * subscription, and nobody would know.
 */
export async function createAnnualSubscription(args: {
  tenantId: string;
  customerId: string;
  plan: PlanKey;
  paymentMethodId: string | null;
  cfg: StripeConfig;
}): Promise<any> {
  const { base, overage } = priceIdsFor(args.plan, 'annual', args.cfg);

  return stripeRequest<any>('/v1/subscriptions', {
    config: args.cfg,
    // One subscription per tenant+plan even if Stripe redelivers the setup
    // event, on top of the stripe_events idempotency.
    idempotencyKey: `annual-sub-${args.tenantId}-${args.plan}`,
    params: {
      customer: args.customerId,
      billing_mode: { type: 'flexible' },
      items: [
        { price: base, quantity: 1 },
        // Metered: no quantity, usage arrives as meter events. Its price is a
        // MONTHLY recurring price, which is the mixed interval in question.
        { price: overage },
      ],
      default_payment_method: args.paymentMethodId || undefined,
      proration_behavior: 'create_prorations',
      metadata: { tenant_id: args.tenantId, plan: args.plan, interval: 'annual' },
      expand: ['latest_invoice'],
    },
  });
}
