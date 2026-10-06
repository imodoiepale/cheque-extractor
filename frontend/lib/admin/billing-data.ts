/**
 * Read-only data layer for the Super Admin firm view.
 *
 * REPOINTED. The first version of this file probed for table names because the
 * trial / usage / comp parcel (migrations 026–029) was not in the tree yet. It
 * has since landed, so this now reads the real sources:
 *
 *   tenants                      plan, trial clock, subscription_status,
 *                                plan_check_allowance            (026)
 *   public.tenant_usage_state()  the single resolver for trial / comp /
 *                                subscription state and usage      (029)
 *   comp_grants                  the Super Admin comp account      (029)
 *   usage_ledger                 read only through tenant_usage_state (027)
 *
 *   tenants (033)                billing_frequency, payment_status,
 *                                paid_through, cancel_at_period_end,
 *                                cancel_at, stripe_customer_id,
 *                                stripe_subscription_id
 *
 * FILLED IN. Those last fields had no source when this file was written; the
 * Stripe parcel (migration 033) puts them on tenants, written only by the
 * signature-verified webhook. They are read below, and STRIPE_FIELDS now lists
 * them as "needs 033" rather than "needs building": if the migration is not
 * applied, the columns are simply absent from the SELECT * rows, every value
 * reads null, and the page says which fields have no source — exactly as
 * before. Nothing here invents a payment state.
 */

export interface FirmBilling {
  plan: string | null;
  billing_frequency: string | null;

  trial_status: string | null;
  trial_ends_at: string | null;
  trial_usage: number | null;
  trial_limit: number | null;
  days_remaining: number | null;

  subscription_status: string | null;
  monthly_usage: number | null;
  included_usage: number | null;
  overage_units: number | null;
  billing_period_start: string | null;
  billing_period_end: string | null;

  payment_status: string | null;
  paid_through: string | null;
  cancellation_status: string | null;
  cancel_at: string | null;

  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;

  processing_allowed: boolean | null;
  block_reason: string | null;

  /** Granted by the billing parcel's comp_grants table. Surfaced, never written. */
  comp_account: {
    active: boolean;
    reason: string | null;
    expires_at: string | null;
    granted_by_email: string | null;
    check_limit: number | null;
    checks_used: number | null;
  } | null;
}

export interface FirmBillingSources {
  /** What each block was actually read from, for the banner on the page. */
  trial: string | null;
  usage: string | null;
  subscription: string | null;
  comp: string | null;
  /** Fields with no source in the schema yet. */
  missing: string[];
}

/**
 * Fields whose only source is the Stripe parcel's columns on tenants
 * (migration 033). Listed rather than guessed, so the page can say "no source"
 * instead of showing a confident blank — reported as missing only when those
 * columns are genuinely absent.
 */
const STRIPE_FIELDS = [
  'billing_frequency',
  'payment_status',
  'paid_through',
  'cancellation_status',
  'stripe_ids',
];

/**
 * Is migration 033 applied? The rows come from `select('*')`, so an unapplied
 * migration means the key is simply not there. Checked on a row rather than by
 * probing, because a probe would be a second round trip to learn the same
 * thing.
 */
function haveStripeColumns(tenants: Array<Record<string, any>>): boolean {
  return tenants.some((t) => 'stripe_customer_id' in t && 'cancel_at_period_end' in t);
}

/**
 * 'active' | 'renewal_disabled' | 'ended' — the same derivation
 * /api/billing/subscription uses, so the firm view and the customer's own
 * billing page cannot disagree about whether a firm is cancelling.
 */
function cancellationStatus(tenant: any): string | null {
  if (!('cancel_at_period_end' in (tenant || {}))) return null;
  if (tenant.subscription_status === 'canceled') return 'ended';
  if (tenant.cancel_at_period_end === true) return 'renewal_disabled';
  return tenant.stripe_subscription_id ? 'active' : null;
}

function tableExists(error: any) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return !(
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    /does not exist|could not find the (table|function)|schema cache/i.test(msg)
  );
}

function num(value: any): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** 'trialing' | 'expired' | 'none', derived from the trial clock on tenants. */
function trialStatus(tenant: any, state: any): string | null {
  if (state?.is_comped) return 'comped';
  const endsAt = state?.trial_ends_at ?? tenant?.trial_ends_at ?? null;
  const subscribed = (state?.subscription_status ?? tenant?.subscription_status) === 'active';
  if (subscribed) return 'converted';
  if (!endsAt) return null;
  const used = num(state?.trial_checks_used) ?? 0;
  const limit = num(state?.trial_check_limit);
  if (limit !== null && used >= limit) return 'limit_reached';
  return new Date(endsAt).getTime() > Date.now() ? 'trialing' : 'expired';
}

/**
 * Build one FirmBilling per tenant.
 *
 * ponytail: one tenant_usage_state() call per tenant, rather than reimplementing
 * its trial/comp/subscription resolution order in TypeScript. Ceiling: O(n) RPC
 * round trips, fine at pilot scale (tens of firms). If the firm list grows past
 * a few hundred, add a set-returning wrapper in SQL and call it once.
 */
export async function loadFirmBilling(
  service: any,
  tenants: Array<{ id: string; [k: string]: any }>
): Promise<{ byTenant: Record<string, FirmBilling>; sources: FirmBillingSources }> {
  // Probe the resolver and comp_grants once, so a database missing 026–029
  // renders a clear banner instead of failing.
  const probe = await service.rpc('tenant_usage_state', {
    p_tenant_id: '00000000-0000-0000-0000-000000000000',
  });
  const haveResolver = tableExists(probe.error);

  const compRes = await service
    .from('comp_grants')
    .select('tenant_id, reason, starts_at, expires_at, revoked_at, granted_by_email, check_limit')
    .order('expires_at', { ascending: false });
  const haveComp = tableExists(compRes.error);

  const compByTenant = new Map<string, any>();
  if (haveComp) {
    for (const row of compRes.data || []) {
      // Ordered by expires_at DESC, so the first live grant per tenant wins —
      // the same rule tenant_usage_state() uses.
      if (!compByTenant.has(row.tenant_id)) compByTenant.set(row.tenant_id, row);
    }
  }

  const states = new Map<string, any>();
  if (haveResolver) {
    const results = await Promise.all(
      tenants.map(async (t) => {
        const { data, error } = await service.rpc('tenant_usage_state', { p_tenant_id: t.id });
        if (error) {
          console.error(`[billing-data] tenant_usage_state(${t.id}):`, error.message);
          return [t.id, null] as const;
        }
        return [t.id, data] as const;
      })
    );
    for (const [id, state] of results) if (state) states.set(id, state);
  }

  const haveStripe = haveStripeColumns(tenants);
  const byTenant: Record<string, FirmBilling> = {};

  for (const tenant of tenants) {
    const state = states.get(tenant.id) || null;
    const comp = compByTenant.get(tenant.id) || null;

    const compActive =
      !!comp &&
      comp.revoked_at === null &&
      new Date(comp.starts_at).getTime() <= Date.now() &&
      new Date(comp.expires_at).getTime() > Date.now();

    const monthlyUsage = num(state?.checks_used_this_period);
    const included = num(state?.plan_check_allowance ?? tenant.plan_check_allowance);

    byTenant[tenant.id] = {
      plan: state?.plan ?? tenant.plan ?? null,
      billing_frequency: tenant.billing_frequency ?? null,

      trial_status: trialStatus(tenant, state),
      trial_ends_at: state?.trial_ends_at ?? tenant.trial_ends_at ?? null,
      trial_usage: num(state?.trial_checks_used),
      trial_limit: num(state?.trial_check_limit ?? tenant.trial_check_limit),
      days_remaining: num(state?.days_remaining),

      subscription_status: state?.subscription_status ?? tenant.subscription_status ?? null,
      monthly_usage: monthlyUsage,
      included_usage: included,
      // Overage is derived, not stored: paid plans bill it rather than block.
      overage_units:
        monthlyUsage !== null && included !== null ? Math.max(0, monthlyUsage - included) : null,
      billing_period_start: state?.billing_period_start ?? null,
      billing_period_end: state?.billing_period_end ?? null,

      // Written only by the verified Stripe webhook (apply_stripe_subscription
      // / the invoice handlers). Null here means no webhook has said otherwise.
      payment_status: tenant.payment_status ?? null,
      paid_through: tenant.paid_through ?? null,
      cancellation_status: cancellationStatus(tenant),
      cancel_at: tenant.cancel_at ?? null,
      stripe_customer_id: tenant.stripe_customer_id ?? null,
      stripe_subscription_id: tenant.stripe_subscription_id ?? null,

      processing_allowed:
        typeof state?.processing_allowed === 'boolean' ? state.processing_allowed : null,
      block_reason: state?.block_reason ?? null,

      comp_account: comp
        ? {
            active: compActive,
            reason: comp.reason ?? null,
            expires_at: comp.expires_at ?? null,
            granted_by_email: comp.granted_by_email ?? null,
            check_limit: num(comp.check_limit),
            checks_used: num(state?.comp_checks_used),
          }
        : null,
    };
  }

  const missing = haveStripe ? [] : [...STRIPE_FIELDS];
  if (!haveResolver) missing.unshift('trial', 'usage', 'subscription');
  if (!haveComp) missing.unshift('comp');

  return {
    byTenant,
    sources: {
      trial: haveResolver ? 'tenants + tenant_usage_state()' : null,
      usage: haveResolver ? 'usage_ledger via tenant_usage_state()' : null,
      subscription: haveResolver
        ? haveStripe
          ? 'tenants.subscription_status + tenants.stripe_* (033)'
          : 'tenants.subscription_status'
        : null,
      comp: haveComp ? 'comp_grants' : null,
      missing,
    },
  };
}

/**
 * Stripe dashboard deep links. Returns nulls until the Stripe parcel stores the
 * ids; the shape is already what the page consumes, so nothing there changes.
 */
export function stripeLinks(billing: FirmBilling, live = true) {
  const base = live ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test';
  return {
    customer: billing.stripe_customer_id ? `${base}/customers/${billing.stripe_customer_id}` : null,
    subscription: billing.stripe_subscription_id
      ? `${base}/subscriptions/${billing.stripe_subscription_id}`
      : null,
  };
}
