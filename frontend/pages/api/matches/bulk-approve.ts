import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm } from '@/lib/match-helpers';

/**
 * POST /api/matches/bulk-approve
 * Approve multiple matches at once
 * Body: { matchIds?: string[], minConfidence?: number }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, userId, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    const { matchIds, minConfidence = 95 } = req.body;

    let query = supabase
      .from('matches')
      .select('id, check_id, status, confidence_score')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId)
      .in('status', ['matched', 'pending']);

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

    await supabase
      .from('matches')
      .update({ status: 'approved', approved_by: userId, approved_at: now })
      .in('id', ids);

    // Audit log
    await supabase.from('match_audit_log').insert(
      ids.map((id: string) => ({
        match_id: id,
        user_id: userId,
        action: 'bulk_approved',
        old_status: 'matched',
        new_status: 'approved',
        details: { minConfidence },
      }))
    );

    return res.status(200).json({ success: true, approved: ids.length });
  } catch (error: any) {
    console.error('Bulk approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
