/**
 * The plan catalogue — CHECKLIST section 7.
 *
 * | Plan         | Monthly | Annual  | Cheques/mo | Overage |
 * |--------------|---------|---------|------------|---------|
 * | Essential    | $147    | $1,617  | 1,200      | $0.15   |
 * | Professional | $497    | $5,467  | 4,500      | $0.12   |
 * | Scale        | $997    | $10,967 | 10,000     | $0.10   |
 *
 * Three things live here and nowhere else:
 *
 *  1. The figures. They are ALSO written literally in app/(app)/billing/page.tsx
 *     (its array shape is asserted by scripts/check-parcel-h.ts) and in
 *     plan_check_allowance_for() in migration 033. scripts/check-stripe-billing.ts
 *     parses CHECKLIST.md and asserts all three agree field by field, so the
 *     duplication cannot drift silently.
 *
 *  2. Price id resolution. A price id is NEVER hardcoded: each plan/interval
 *     maps to an environment variable name, separated by Stripe environment
 *     (TEST vs LIVE), so a test price can never be charged in live or the
 *     reverse.
 *
 *  3. `includedChecks` is PER MONTH for every interval. An annual subscriber
 *     does not get 12 × 4,500 to spend whenever they like: the allowance is
 *     scoped to the monthly window current_billing_period() returns. Nothing
 *     in this file multiplies by 12, on purpose.
 */

export type PlanKey = 'essential' | 'professional' | 'scale';
export type BillingInterval = 'monthly' | 'annual';

export interface Plan {
  key: PlanKey;
  name: string;
  /** USD per month, billed monthly. */
  monthly: number;
  /** USD per year, billed annually. */
  annual: number;
  /** Included cheques per MONTH — the same number on either interval. */
  includedChecks: number;
  /** USD per cheque beyond the monthly allowance. */
  overage: number;
  popular: boolean;
}

export const PLANS: readonly Plan[] = [
  { key: 'essential',    name: 'Essential',    monthly: 147, annual: 1617,  includedChecks: 1200,  overage: 0.15, popular: false },
  { key: 'professional', name: 'Professional', monthly: 497, annual: 5467,  includedChecks: 4500,  overage: 0.12, popular: true  },
  { key: 'scale',        name: 'Scale',        monthly: 997, annual: 10967, includedChecks: 10000, overage: 0.10, popular: false },
] as const;

export const PLAN_KEYS: readonly PlanKey[] = PLANS.map((p) => p.key);

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}

export function isInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

export function planByKey(key: unknown): Plan | null {
  return PLANS.find((p) => p.key === key) ?? null;
}

/**
 * Included cheques per billing period. Mirrors
 * public.plan_check_allowance_for() in migration 033 — that function is what
 * actually writes tenants.plan_check_allowance; this is for display and for
 * the estimate on the billing page.
 */
export function allowanceForPlan(plan: unknown): number | null {
  return planByKey(typeof plan === 'string' ? plan.toLowerCase().trim() : plan)?.includedChecks ?? null;
}

export function overageRateForPlan(plan: unknown): number | null {
  return planByKey(typeof plan === 'string' ? plan.toLowerCase().trim() : plan)?.overage ?? null;
}

/** USD charge for `used` cheques against a plan's monthly allowance. */
export function overageEstimate(plan: unknown, used: number): {
  units: number;
  rate: number | null;
  amount: number | null;
} {
  const p = planByKey(typeof plan === 'string' ? plan.toLowerCase().trim() : plan);
  if (!p) return { units: 0, rate: null, amount: null };
  const units = Math.max(0, Math.floor(used) - p.includedChecks);
  // Rounded to cents at the end, not per unit: 1 unit at $0.12 is $0.12, and
  // 1,000 units is $120.00, not $120.0000000001.
  return { units, rate: p.overage, amount: Math.round(units * p.overage * 100) / 100 };
}

/* ────────────────────────── price id environment ────────────────────────── */

export type StripeEnv = 'test' | 'live';

/**
 * Environment variable name for one price. Deliberately a function rather than
 * a map literal, so the naming scheme exists once:
 *
 *   STRIPE_PRICE_TEST_PROFESSIONAL_ANNUAL
 *   STRIPE_PRICE_LIVE_PROFESSIONAL_OVERAGE
 *
 * `overage` is the metered price (per cheque beyond the allowance) and is
 * billed MONTHLY on every plan, including annual ones.
 */
export function priceEnvVar(
  env: StripeEnv,
  plan: PlanKey,
  kind: BillingInterval | 'overage'
): string {
  return `STRIPE_PRICE_${env.toUpperCase()}_${plan.toUpperCase()}_${kind.toUpperCase()}`;
}

/** Every price id variable the given environment needs. */
export function requiredPriceEnvVars(env: StripeEnv): string[] {
  const vars: string[] = [];
  for (const plan of PLAN_KEYS) {
    for (const kind of ['monthly', 'annual', 'overage'] as const) {
      vars.push(priceEnvVar(env, plan, kind));
    }
  }
  return vars;
}

export function priceId(
  env: StripeEnv,
  plan: PlanKey,
  kind: BillingInterval | 'overage',
  source: Record<string, string | undefined> = process.env as any
): string | null {
  const raw = source[priceEnvVar(env, plan, kind)];
  const trimmed = (raw || '').trim();
  return trimmed ? trimmed : null;
}

/**
 * Reverse lookup: which plan/interval does this Stripe price id mean?
 *
 * Used by the webhook. Resolving the plan from the price id rather than from
 * Checkout metadata matters: metadata is whatever the client session said,
 * while the price id is what Stripe will actually charge. A tampered metadata
 * field must not be able to award a Scale allowance on an Essential price.
 */
export function planFromPriceId(
  id: string | null | undefined,
  env: StripeEnv,
  source: Record<string, string | undefined> = process.env as any
): { plan: PlanKey; kind: BillingInterval | 'overage' } | null {
  const needle = (id || '').trim();
  if (!needle) return null;
  for (const plan of PLAN_KEYS) {
    for (const kind of ['monthly', 'annual', 'overage'] as const) {
      if (priceId(env, plan, kind, source) === needle) return { plan, kind };
    }
  }
  return null;
}
