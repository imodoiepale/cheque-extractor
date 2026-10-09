import type { AdminFn } from './index';
import { compGrants, str } from './_shared';
import { PROFILE_COLS, type ProfileRow, tenantsById, toAdminUser } from './admin-users-list';

const userDetail: AdminFn = async (body, { db }) => {
  const id = str(body.targetUserId) ?? str(body.userId);
  if (!id) throw new Error('targetUserId required');

  const { data, error } = await db.from('user_profiles').select(PROFILE_COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('User not found');
  const p = data as ProfileRow;
  const tenantId = p.tenant_id ?? '';

  const [tenants, authRes, grants, jobs, invoices] = await Promise.all([
    tenantsById(db, [tenantId]),
    db.auth.admin.getUserById(id),
    compGrants(db),
    db.from('check_jobs').select('job_id, pdf_name, status, total_checks, created_at, completed_at')
      .eq('user_id', id).order('created_at', { ascending: false }).limit(25),
    tenantId
      ? db.from('billing_invoices').select('stripe_invoice_id, number, status, amount_paid, currency, paid_at, created_at, hosted_invoice_url')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(25)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  type Inv = { stripe_invoice_id: string; number: string | null; status: string; amount_paid: number | null; currency: string | null; paid_at: string | null; created_at: string; hosted_invoice_url: string | null };

  return {
    profile: toAdminUser(p, tenants.get(tenantId), authRes.data.user ?? undefined, grants.get(tenantId)),
    // DepthMe wellness collections have no Kyriq equivalent.
    rituals: [],
    journals: [],
    boards: [],
    feedback: [],
    meditation: [],
    events: [],
    jobs: jobs.data ?? [],
    invoices: ((invoices.data ?? []) as Inv[]).map((i) => ({
      stripe_id: i.stripe_invoice_id,
      number: i.number,
      status: i.status,
      amount_paid_cents: i.amount_paid,
      currency: i.currency,
      paid_at: i.paid_at,
      created_at: i.created_at,
      hosted_invoice_url: i.hosted_invoice_url,
    })),
  };
};

export default userDetail;
