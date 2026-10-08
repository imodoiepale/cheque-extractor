/**
 * Shared server-side billing helpers.
 *
 * Everything here runs under the SERVICE client, because every billing table in
 * migration 033 revokes writes from `authenticated` — the browser can read its
 * own firm's invoices and nothing else.
 */
import crypto from 'node:crypto';
import type { NextApiRequest } from 'next';
import { createServiceClient } from '@/lib/supabase/api';
import { stripeConfig, stripeRequest, idOf, type StripeConfig } from './stripe';
import { planByKey, priceId, type BillingInterval, type PlanKey } from './plans';

export interface BillingTenant {
  id: string;
  name?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  billing_frequency?: string | null;
  payment_status?: string | null;
  payment_grace_until?: string | null;
  paid_through?: string | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: string | null;
  canceled_at?: string | null;
  plan_check_allowance?: number | null;
  [k: string]: any;
}

/** True when the error means "that relation/column/function isn't there". */
export function isMissingSchema(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    /does not exist|could not find the (table|function|column)|schema cache/i.test(msg)
  );
}

/**
 * Shared secret for the two cron endpoints (meter reporting, renewal
 * reminders). Constant-time compare, and an unset secret denies everything —
 * these endpoints move money and send notices, so "no secret configured" must
 * never mean "open to everyone".
 */
export function cronAuthorised(req: NextApiRequest): boolean {
  // BILLING_CRON_SECRET is ours; CRON_SECRET is the name Vercel Cron sends as
  // `Authorization: Bearer <CRON_SECRET>`. Accepting either means one secret
  // works for both a hand-rolled scheduler and Vercel's, rather than someone
  // having to keep two in sync — and an unset secret still denies everyone.
  const expected = (
    process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET || ''
  ).trim();
  if (!expected) return false;
  const header = req.headers.authorization || '';
  const given = (
    header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-billing-cron'] || '')
  ).trim();
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function service() {
  return createServiceClient();
}

export async function loadBillingTenant(tenantId: string): Promise<BillingTenant | null> {
  const { data, error } = await service().from('tenants').select('*').eq('id', tenantId).single();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return (data as BillingTenant) ?? null;
}

/** The app's public origin, for Checkout return URLs. */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3080'
  ).replace(/\/+$/, '');
}

/**
 * The Stripe customer for a tenant, created on first use.
 *
 * Stored back on tenants under a UNIQUE index, so two concurrent calls cannot
 * leave a firm with two customers silently billed in parallel — the second
 * write loses and we re-read the winner.
 */
export async function ensureCustomer(
  tenant: BillingTenant,
  email: string | null,
  cfg: StripeConfig
): Promise<string> {
  if (tenant.stripe_customer_id) return tenant.stripe_customer_id;

  const customer = await stripeRequest<any>('/v1/customers', {
    config: cfg,
    idempotencyKey: `tenant-customer-${tenant.id}`,
    params: {
      email: email || undefined,
      name: tenant.name || undefined,
      metadata: { tenant_id: tenant.id },
    },
  });

  const { error } = await service()
    .from('tenants')
    .update({ stripe_customer_id: customer.id })
    .eq('id', tenant.id);

  if (error) {
    const fresh = await loadBillingTenant(tenant.id);
    if (fresh?.stripe_customer_id) return fresh.stripe_customer_id;
    throw error;
  }
  return customer.id;
}

/** Resolve the two price ids a subscription needs: base + metered overage. */
export function priceIdsFor(
  plan: PlanKey,
  interval: BillingInterval,
  cfg: StripeConfig
): { base: string; overage: string } {
  const base = priceId(cfg.env, plan, interval);
  const overage = priceId(cfg.env, plan, 'overage');
  if (!base || !overage) {
    throw new Error(
      `Missing ${cfg.env} price id for ${plan}/${interval}. Price ids come from the environment only — never hardcode one.`
    );
  }
  return { base, overage };
}

/**
 * Find the tenant a Stripe object belongs to.
 *
 * Order matters: metadata.tenant_id is what WE set when creating the object, so
 * it is checked first, then the stored customer/subscription id. A webhook that
 * cannot be attributed is recorded and skipped — never applied to a guess.
 */
export async function tenantIdForStripeObject(obj: any): Promise<string | null> {
  const metaTenant =
    obj?.metadata?.tenant_id ||
    obj?.subscription_details?.metadata?.tenant_id ||
    obj?.lines?.data?.[0]?.metadata?.tenant_id ||
    null;
  if (typeof metaTenant === 'string' && metaTenant) return metaTenant;

  const svc = service();
  const customerId = idOf(obj?.customer);
  if (customerId) {
    const { data } = await svc.from('tenants').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    if (data?.id) return data.id;
  }

  const subId = idOf(obj?.subscription) || (obj?.object === 'subscription' ? obj.id : null);
  if (subId) {
    const { data } = await svc.from('tenants').select('id').eq('stripe_subscription_id', subId).maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

/** The base (non-metered) item of a subscription, and the metered one. */
export function splitSubscriptionItems(subscription: any): { base: any | null; metered: any | null } {
  const items: any[] = subscription?.items?.data || [];
  const metered =
    items.find((i) => i?.price?.recurring?.usage_type === 'metered' || i?.price?.recurring?.meter) || null;
  const base = items.find((i) => i !== metered) || null;
  return { base, metered };
}

/** 'monthly' | 'annual' from a Stripe price's recurring interval. */
export function intervalOfPrice(price: any): BillingInterval | null {
  const interval = price?.recurring?.interval;
  if (interval === 'month') return 'monthly';
  if (interval === 'year') return 'annual';
  return null;
}

export function planLabel(key: unknown): string {
  return planByKey(key)?.name ?? (typeof key === 'string' ? key : 'Unknown');
}

export { stripeConfig };
