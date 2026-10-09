import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AdminFn } from './index';
import { TENANT_COLS, type TenantRow, authUsers, compGrants, isBanned, isSuperAdminUser, selectAll, str } from './_shared';

export interface ProfileRow {
  id: string;
  tenant_id: string | null;
  email: string;
  full_name: string | null;
  role: string | null;
  created_at: string;
}
export const PROFILE_COLS = 'id, tenant_id, email, full_name, role, created_at';

/** Shape a Kyriq user_profiles row as DepthMe's admin user row. */
export function toAdminUser(p: ProfileRow, t: TenantRow | undefined, auth: User | undefined, grantExpires: string | undefined) {
  const paying = t?.subscription_status === 'active';
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    display_name: t?.name ?? null, // firm name
    created_at: p.created_at,
    last_active_at: auth?.last_sign_in_at ?? null,
    is_premium: paying,
    premium_plan: paying ? (t?.billing_frequency === 'annual' ? 'yearly' : 'monthly') : null,
    premium_grant_expires_at: grantExpires ?? null,
    premium_grant_source: grantExpires ? 'comp_grant' : null,
    // "admin" in this console means super admin; the firm role is firm_role.
    role: isSuperAdminUser(auth, p.email) ? 'admin' : null,
    suspended: isBanned(auth),
    firm_role: p.role,
    tenant_id: p.tenant_id,
    firm_name: t?.name ?? null,
    plan: t?.plan ?? null,
    subscription_status: t?.subscription_status ?? null,
    trial_ends_at: t?.trial_ends_at ?? null,
    country_code: null,
    utm_source: null,
  };
}

export async function tenantsById(db: SupabaseClient, ids: string[]): Promise<Map<string, TenantRow>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, TenantRow>();
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from('tenants').select(TENANT_COLS).in('id', uniq.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const t of (data ?? []) as TenantRow[]) map.set(t.id, t);
  }
  return map;
}

const SORTABLE = new Set(['created_at', 'email', 'full_name']);

const usersList: AdminFn = async (body, { db }) => {
  const isExport = body.exportAll === true;
  const limit = isExport ? 5000 : Math.min(Number(body.limit) || 50, 100);
  const sortBy = SORTABLE.has(String(body.sortBy)) ? String(body.sortBy) : 'created_at';
  const asc = body.sortDir === 'asc';
  // Strip PostgREST filter syntax so a search cannot inject extra .or() clauses.
  const search = str(body.search)?.replace(/[,()%*\\]/g, '').trim();
  const cursor = str(body.cursor);

  const grants = await compGrants(db);
  let premiumTenants: string[] | null = null;
  if (typeof body.isPremium === 'boolean') {
    const active = await selectAll<{ id: string }>((a, b) =>
      db.from('tenants').select('id').eq('subscription_status', 'active').range(a, b));
    premiumTenants = [...new Set([...active.map((t) => t.id), ...grants.keys()])];
  }

  let q = db.from('user_profiles').select(PROFILE_COLS).order(sortBy, { ascending: asc }).limit(limit + 1);
  if (search) q = q.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  if (premiumTenants) {
    if (body.isPremium) {
      if (!premiumTenants.length) return { rows: [], nextCursor: null, hasMore: false };
      q = q.in('tenant_id', premiumTenants);
    } else if (premiumTenants.length) {
      q = q.not('tenant_id', 'in', `(${premiumTenants.join(',')})`);
    }
  }
  if (cursor) q = asc ? q.gt(sortBy, cursor) : q.lt(sortBy, cursor);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const all = (data ?? []) as ProfileRow[];
  const hasMore = all.length > limit;
  const rows = hasMore ? all.slice(0, limit) : all;

  const [tenants, auth] = await Promise.all([tenantsById(db, rows.map((r) => r.tenant_id ?? '')), authUsers(db)]);
  const last = rows[rows.length - 1] as unknown as Record<string, unknown> | undefined;

  return {
    rows: rows.map((p) => toAdminUser(p, tenants.get(p.tenant_id ?? ''), auth.get(p.id), grants.get(p.tenant_id ?? ''))),
    hasMore,
    nextCursor: hasMore && last ? (last[sortBy] as string | null) : null,
  };
};

export default usersList;
