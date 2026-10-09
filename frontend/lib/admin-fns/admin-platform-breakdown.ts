import type { AdminFn } from './index';
import { TENANT_COLS, type TenantRow, selectAll, tenantMrrCents } from './_shared';

/** Kyriq bills only through Stripe on the web: everything lands on "web". */
const platformBreakdown: AdminFn = async (_body, { db }) => {
  const [users, tenants] = await Promise.all([
    db.from('user_profiles').select('id', { count: 'exact', head: true }),
    selectAll<TenantRow>((a, b) => db.from('tenants').select(TENANT_COLS).range(a, b)),
  ]);
  if (users.error) throw new Error(users.error.message);
  const signups = users.count ?? 0;
  const paid = tenants.filter((t) => t.subscription_status === 'active');
  const estMrr = paid.reduce((s, t) => s + tenantMrrCents(t), 0) / 100; // dollars, as DepthMe's formatCurrency expects

  return {
    byPlatform: [
      { platform: 'web', signups, paidCustomers: paid.length, conversionPct: signups ? Math.round((paid.length / signups) * 1000) / 10 : 0, estMrr },
      { platform: 'ios', signups: 0, paidCustomers: 0, conversionPct: 0, estMrr: 0 },
      { platform: 'android', signups: 0, paidCustomers: 0, conversionPct: 0, estMrr: 0 },
    ],
    funnelByPlatform: [], // needs an events table Kyriq does not have
  };
};

export default platformBreakdown;
