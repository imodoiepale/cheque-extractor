import type { AdminFn } from './index';
import { TENANT_COLS, type TenantRow, compGrants, selectAll, tenantMrrCents } from './_shared';

const iso = (v: unknown, fallback: Date) => {
  const d = new Date(typeof v === 'string' || v instanceof Date ? v : fallback);
  return (Number.isNaN(d.getTime()) ? fallback : d).toISOString();
};

const metrics: AdminFn = async (body, { db }) => {
  const now = new Date();
  const from = iso(body.from, new Date(now.getTime() - 30 * 86400_000));
  const to = iso(body.to, now);
  const nowIso = now.toISOString();
  const soon = new Date(now.getTime() + 3 * 86400_000).toISOString();

  const [usersCount, tenants, signups, jobs, ledger, grants] = await Promise.all([
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    selectAll<TenantRow>((a, b) => db.from('tenants').select(TENANT_COLS).range(a, b)),
    selectAll<{ created_at: string }>((a, b) =>
      db.from('user_profiles').select('created_at').gte('created_at', from).lte('created_at', to).order('created_at').range(a, b)),
    selectAll<{ user_id: string | null }>((a, b) =>
      db.from('check_jobs').select('user_id').gte('created_at', from).lte('created_at', to).range(a, b)),
    selectAll<{ quantity: number }>((a, b) =>
      db.from('usage_ledger').select('quantity').eq('event_type', 'check_processed')
        .gte('occurred_at', from).lte('occurred_at', to).range(a, b)),
    compGrants(db),
  ]);
  if (usersCount.error) throw new Error(usersCount.error.message);

  const paying = tenants.filter((t) => t.subscription_status === 'active');
  const onTrial = tenants.filter((t) => t.subscription_status !== 'active' &&
    (t.subscription_status === 'trialing' || t.plan === 'trial' || (t.trial_ends_at && t.trial_ends_at > nowIso)));
  const everTrialled = tenants.filter((t) => t.trial_ends_at || t.subscription_status === 'trialing' || t.plan === 'trial').length;

  const yearly = paying.filter((t) => t.billing_frequency === 'annual');
  const monthly = paying.filter((t) => t.billing_frequency !== 'annual');
  const mrrMonthlyCents = monthly.reduce((s, t) => s + tenantMrrCents(t), 0);
  const mrrYearlyCents = yearly.reduce((s, t) => s + tenantMrrCents(t), 0);
  const mrrCents = mrrMonthlyCents + mrrYearlyCents;

  // Tenants sharing one Stripe customer = duplicate subscriptions.
  const byCustomer = new Map<string, TenantRow[]>();
  for (const t of tenants) if (t.stripe_customer_id) byCustomer.set(t.stripe_customer_id, [...(byCustomer.get(t.stripe_customer_id) ?? []), t]);
  const dupGroups = [...byCustomer.values()].filter((g) => g.length > 1);
  const duplicateSubscriptions = await Promise.all(dupGroups.map(async (g) => {
    const { data } = await db.from('user_profiles').select('email').in('tenant_id', g.map((t) => t.id))
      .eq('role', 'admin').order('created_at').limit(1);
    return { email: (data?.[0] as { email?: string } | undefined)?.email ?? g[0].name ?? g[0].id, count: g.length };
  }));
  const uniquePaying = new Set(paying.map((t) => t.stripe_customer_id ?? t.id)).size;
  const grantedNotPaying = [...grants.keys()].filter((id) => !paying.some((t) => t.id === id)).length;

  return {
    totalUsers: usersCount.count ?? 0,
    premiumUsers: paying.length,
    paidCustomers: uniquePaying,
    grantedUsers: grantedNotPaying,
    monthlyUsers: monthly.length,
    yearlyUsers: yearly.length,
    newSignups: signups.length,
    activeUsers: new Set(jobs.map((j) => j.user_id).filter(Boolean)).size,
    mrrCents,
    arrCents: mrrCents * 12,
    mrrMonthlyCents,
    mrrYearlyCents,
    activeMonthlySubs: monthly.length,
    activeYearlySubs: yearly.length,
    trialExpiringSoon: onTrial.filter((t) => t.trial_ends_at && t.trial_ends_at > nowIso && t.trial_ends_at <= soon).length,
    usersOnTrial: onTrial.length,
    trialConversionRate: paying.length + everTrialled > 0 ? paying.length / (paying.length + everTrialled) : null,
    totalAiGenerations: ledger.reduce((s, r) => s + (r.quantity ?? 0), 0),
    feedbackCount: 0, // Kyriq has no feedback table.
    signupsByDay: signups,
    activeSubsCount: paying.length,
    uniquePayingCustomers: uniquePaying,
    duplicateSubscriptions,
  };
};

export default metrics;
