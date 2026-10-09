import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminFn } from './index';
import { selectAll } from './_shared';

const distinctTenants = async (db: SupabaseClient, table: string, filter?: [string, string]) => {
  const rows = await selectAll<{ tenant_id: string | null }>((a, b) => {
    let q = db.from(table).select('tenant_id');
    if (filter) q = q.eq(filter[0], filter[1]);
    return q.range(a, b);
  });
  return new Set(rows.map((r) => r.tenant_id).filter(Boolean)).size;
};

/**
 * Kyriq trial funnel from real tables (the page's `steps` event names are ignored:
 * there is no events table). Signups are user_profiles; later steps count firms.
 */
// ponytail: all-time funnel, ignores from/to; scope by created_at per table if a dated funnel is needed.
const funnelQuery: AdminFn = async (_body, { db }) => {
  const users = await db.from('user_profiles').select('id', { count: 'exact', head: true });
  if (users.error) throw new Error(users.error.message);
  const paid = await db.from('tenants').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active');
  if (paid.error) throw new Error(paid.error.message);

  const counts: [string, number][] = [
    ['signed_up', users.count ?? 0],
    ['connected_quickbooks', await distinctTenants(db, 'qb_connections')],
    ['first_upload', await distinctTenants(db, 'check_jobs')],
    ['first_approval', await distinctTenants(db, 'checks', ['status', 'approved'])],
    ['paid', paid.count ?? 0],
  ];
  return {
    funnel: counts.map(([step, n], i) => {
      const prev = i ? counts[i - 1][1] : n;
      return { step, users: n, drop_off_pct: i && prev ? Math.round((1 - n / prev) * 1000) / 10 : 0 };
    }),
  };
};

export default funnelQuery;
