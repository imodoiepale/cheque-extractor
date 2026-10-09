/**
 * Helpers shared by the ported admin-* handlers. Table and column names are
 * checked against supabase/migrations (001, 026, 027, 029, 033).
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PLANS } from '@/lib/billing/plans';
import { stripeConfig, stripeRequest } from '@/lib/billing/stripe';
import { SUPER_ADMIN_EMAILS } from '@/lib/super-admin';
import type { AdminCtx } from './index';

export type Row = Record<string, unknown>;

export interface TenantRow {
  id: string;
  name: string | null;
  plan: string | null;
  subscription_status: string | null;
  billing_frequency: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  created_at: string | null;
}
export const TENANT_COLS =
  'id, name, plan, subscription_status, billing_frequency, trial_ends_at, stripe_customer_id, created_at';

/** Read every row of a query past PostgREST's 1000-row cap. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Every auth user, keyed by id (last_sign_in_at, banned_until, app_metadata). */
// ponytail: walks all auth users per call; fine to a few thousand users, past that cache or join via an RPC.
export async function authUsers(db: SupabaseClient): Promise<Map<string, User>> {
  const map = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) map.set(u.id, u);
    if (data.users.length < 1000) return map;
  }
}

export function isSuperAdminUser(u: User | undefined, email?: string | null): boolean {
  const e = (u?.email ?? email ?? '').toLowerCase();
  return u?.app_metadata?.role === 'super_admin' || SUPER_ADMIN_EMAILS.includes(e);
}

export function isBanned(u: User | undefined): boolean {
  const until = (u as (User & { banned_until?: string | null }) | undefined)?.banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

/** Monthly recurring revenue for one tenant in cents (annual price / 12 for annual billing). */
export function tenantMrrCents(t: Pick<TenantRow, 'plan' | 'billing_frequency'>): number {
  const plan = PLANS.find((p) => p.key === t.plan);
  if (!plan) return 0;
  return Math.round(t.billing_frequency === 'annual' ? (plan.annual * 100) / 12 : plan.monthly * 100);
}

/** Tenant ids holding a live comp grant (comp_grants, migration 029). */
export async function compGrants(db: SupabaseClient): Promise<Map<string, string>> {
  const rows = await selectAll<{ tenant_id: string; expires_at: string }>((a, b) =>
    db.from('comp_grants').select('tenant_id, expires_at').is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).range(a, b)
  );
  const m = new Map<string, string>();
  for (const r of rows) if (!m.has(r.tenant_id) || r.expires_at > m.get(r.tenant_id)!) m.set(r.tenant_id, r.expires_at);
  return m;
}

/** audit_logs row under the acting super admin's own tenant. */
export async function audit(ctx: AdminCtx, action: string, metadata: Row): Promise<void> {
  const { data } = await ctx.db.from('user_profiles').select('tenant_id').eq('id', ctx.user.id).maybeSingle();
  const tenantId = (data as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) throw new Error('Acting admin has no tenant; cannot write the audit log.');
  const { error } = await ctx.db.from('audit_logs').insert({
    tenant_id: tenantId, user_id: ctx.user.id, action, metadata: { ...metadata, actor_email: ctx.user.email },
  });
  if (error) throw new Error(`audit_logs insert failed: ${error.message}`);
}

export const stripeOn = (): boolean => Boolean(stripeConfig().secretKey);

/** GET a Stripe list/object with the pinned REST helper. */
export function stripeGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  return stripeRequest<T>(path, { method: 'GET', params });
}

export const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
