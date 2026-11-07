import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm, requireCapability, READ_METHODS } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { sendEmail } from '@/lib/email/send';

/**
 * POST /api/matches/bulk-approve
 * Approve multiple matches at once
 * Body: { matchIds?: string[], minConfidence?: number, batchId?: string }
 *
 * `batchId` matters more than it looks. Review runs inside the reconcile
 * stepper, which is scoped to one batch, so "Approve All ≥95%" pressed there
 * must not reach matches belonging to another batch of the same tenant. A
 * malformed id is rejected rather than ignored: ignoring it would silently
 * widen the write back to the whole tenant, which is the opposite of what the
 * caller asked for.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Server-side role gate (lib/roles.ts): the UI hiding the action is not enough.
  if (!READ_METHODS.has(req.method ?? '') && !(await requireCapability(req, res, 'checks.edit'))) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, userId, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    const { matchIds, minConfidence = 95, batchId } = req.body;

    if (batchId != null && (typeof batchId !== 'string' || !UUID.test(batchId))) {
      return res.status(400).json({ error: 'batchId must be a uuid' });
    }

    let query = supabase
      .from('matches')
      .select('id, check_id, qb_txn_id, status, confidence_score')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId)
      .in('status', ['matched', 'pending']);

    if (batchId) query = query.eq('batch_id', batchId);

    if (matchIds?.length) {
      query = query.in('id', matchIds);
    } else {
      query = query.gte('confidence_score', minConfidence);
    }

    const { data: candidates, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    // One QuickBooks transaction clears one cheque. When two cheques (a repeated
    // image, a double presentment) point at the same QB transaction, or one is
    // already approved against it, none of them is bulk-approved: a person picks.
    const txnIds = [...new Set((candidates || []).map((m: any) => m.qb_txn_id).filter(Boolean))];
    const { data: taken } = txnIds.length
      ? await supabase.from('matches').select('qb_txn_id').eq('tenant_id', tenantId)
          .eq('status', 'approved').in('qb_txn_id', txnIds)
      : { data: [] as any[] };
    const shared = new Set((taken || []).map((m: any) => m.qb_txn_id));
    const seen = new Map<string, number>();
    (candidates || []).forEach((m: any) => m.qb_txn_id && seen.set(m.qb_txn_id, (seen.get(m.qb_txn_id) || 0) + 1));
    seen.forEach((n, id) => { if (n > 1) shared.add(id); });
    const toApprove = (candidates || []).filter((m: any) => !m.qb_txn_id || !shared.has(m.qb_txn_id));
    const skipped = (candidates || []).length - toApprove.length;
    if (!toApprove.length) return res.json({ approved: 0, skippedDuplicates: skipped });

    const ids = toApprove.map((m: any) => m.id);
    const checkIds = toApprove.map((m: any) => m.check_id);
    const now = new Date().toISOString();

    // Service client for writes — bypasses RLS (auth already verified above)
    const db = createServiceClient();

    await db
      .from('matches')
      .update({ status: 'approved', approved_by: userId, approved_at: now })
      .in('id', ids)
      .eq('tenant_id', tenantId);

    // Sync parent checks so the matching algorithm won't re-process them.
    const validCheckIds = checkIds.filter(Boolean);
    if (validCheckIds.length) {
      await db
        .from('checks')
        .update({ status: 'approved' })
        .in('id', validCheckIds)
        .eq('tenant_id', tenantId);
    }

    // Audit log
    await db.from('match_audit_log').insert(
      ids.map((id: string) => ({
        match_id: id,
        user_id: userId,
        action: 'bulk_approved',
        old_status: 'matched',
        new_status: 'approved',
        details: { minConfidence },
        tenant_id: tenantId,
      }))
    );

    // Summary to the person who approved. Awaited (serverless may freeze a
    // detached promise) but fully guarded: the approval already happened.
    try {
      await clearedEmail(db, { tenantId, userId, realmId, batchId, count: ids.length, checkIds: validCheckIds });
    } catch (mailErr: any) {
      console.error('[bulk-approve] cleared email failed:', mailErr?.message || mailErr);
    }

    return res.status(200).json({ success: true, approved: ids.length, skippedDuplicates: skipped });
  } catch (error: any) {
    console.error('Bulk approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function clearedEmail(
  db: ReturnType<typeof createServiceClient>,
  a: { tenantId: string; userId: string; realmId: string | null; batchId?: string; count: number; checkIds: string[] }
) {
  const [{ data: me }, { data: checks }, { data: company }, { data: tenant }] = await Promise.all([
    db.from('user_profiles').select('email, full_name').eq('id', a.userId).maybeSingle(),
    a.checkIds.length
      ? db.from('checks').select('amount').in('id', a.checkIds).eq('tenant_id', a.tenantId)
      : Promise.resolve({ data: [] as any[] }),
    db.from('qb_connections').select('company_name').eq('tenant_id', a.tenantId).eq('realm_id', a.realmId ?? '').maybeSingle(),
    db.from('tenants').select('name').eq('id', a.tenantId).maybeSingle(),
  ]);
  if (!me?.email) return;

  let open = db
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', a.tenantId)
    .eq('realm_id', a.realmId ?? '')
    .in('status', ['matched', 'pending']);
  if (a.batchId) open = open.eq('batch_id', a.batchId);
  const { count: remaining } = await open;

  await sendEmail({
    to: me.email,
    template: 'reconciliation_cleared',
    tenantId: a.tenantId,
    vars: {
      firmName: tenant?.name ?? null,
      approvedBy: me.full_name || me.email,
      clearedCount: a.count,
      clearedTotal: (checks || []).reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0),
      companyName: company?.company_name ?? null,
      remaining: remaining ?? 0,
    },
    metadata: { batch_id: a.batchId ?? null },
  });
}
