import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';

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
      .select('id, check_id, status, confidence_score')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId)
      .in('status', ['matched', 'pending']);

    if (batchId) query = query.eq('batch_id', batchId);

    if (matchIds?.length) {
      query = query.in('id', matchIds);
    } else {
      query = query.gte('confidence_score', minConfidence);
    }

    const { data: toApprove, error: fetchErr } = await query;
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!toApprove?.length) return res.json({ approved: 0 });

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

    return res.status(200).json({ success: true, approved: ids.length });
  } catch (error: any) {
    console.error('Bulk approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
