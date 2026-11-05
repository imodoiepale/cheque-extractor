/**
 * Kyriq's plans — the one place they are written down.
 *
 * WHY THIS EXISTS: the three admin screens that talk about money were ported
 * from DepthMe and kept importing DepthMe's prices, so the admin console
 * modelled a $14.99/month consumer app while Kyriq sells a $249–$1,299/month
 * product to accounting firms. The Profit Calculator was out by roughly 17x and
 * had no concept of the cheque allowance or the overage rate, which between them
 * are most of Kyriq's unit economics. The plans themselves existed only as a
 * literal inside components/landing/LandingPage.tsx, so there was nothing for
 * the admin side to import even if it had wanted to.
 *
 * STRIPE IS THE SOURCE OF TRUTH FOR WHAT IS ACTUALLY CHARGED. Nothing here can
 * change a customer's bill: checkout is built from the STRIPE_*_PRICE_ID
 * environment variables. These constants control what the product SAYS the
 * price is — on the landing page and in the owner-facing admin dashboards — so
 * they can drift from Stripe, and the only defence is that there is exactly one
 * of them. scripts/check-landing.ts asserts these values, so a change here is
 * deliberate and visible in review.
 */

export type PlanTier = 'essential' | 'professional' | 'scale';

export interface Plan {
  tier: PlanTier;
  /** What customers see. The tier id is what code should branch on. */
  name: string;
  /** USD per month, billed monthly. */
  monthly: number;
  /** USD per year, billed annually — one month free against 12x monthly. */
  annual: number;
  /** Cheques included per month. Allowances reset monthly on both billing periods. */
  allowance: number;
  /** USD per cheque beyond the allowance. A string because it is display copy. */
  overage: string;
  popular?: boolean;
  extra?: string;
}

export function isPlanTier(value: unknown): value is Plan['tier'] {
  return PLANS.some((p) => p.tier === value);
}

export const PLANS: Plan[] = [
  { tier: 'essential', name: 'Starter', monthly: 249, annual: 2739, allowance: 1200, overage: '0.20' },
  { tier: 'professional', name: 'Professional', monthly: 649, annual: 7139, allowance: 4500, overage: '0.20', popular: true, extra: 'Priority support' },
  { tier: 'scale', name: 'Firm', monthly: 1299, annual: 14289, allowance: 10000, overage: '0.20', extra: 'Onboarding assistance' },
];

/** True of every plan, so it is stated once and rendered on all three. */
export const INCLUDED_IN_EVERY_PLAN = [
  'Unlimited companies',
  'Unlimited users',
  'Kyriq Chrome extension included',
  'All core features',
];

/** Every plan charges the same rate per cheque over the allowance. */
export const OVERAGE_USD_PER_CHECK = 0.2;

/** Stripe's standard card rate. Fees are taken off gross, before any cost. */
export const STRIPE_FEE_PCT = 2.9;
export const STRIPE_FEE_FLAT_USD = 0.3;

export const planByTier = (tier: PlanTier): Plan =>
  PLANS.find((p) => p.tier === tier) ?? PLANS[0];

/** Annual price expressed per month, for comparing like with like. */
export const annualPerMonth = (plan: Plan): number => plan.annual / 12;

/** What the annual commitment saves against paying monthly for a year. */
export const annualSavingUsd = (plan: Plan): number => plan.monthly * 12 - plan.annual;

export const formatUsd = (n: number, dp = 0): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
