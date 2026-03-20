import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm } from '@/lib/match-helpers';

/**
 * GET /api/matches
 * Fetch all matches for the active QB company
 * Query params: status, search, sort, page, limit
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    if (!realmId) return res.status(400).json({ error: 'No active QB connection' });

    const { status, search, sort = 'confidence', page = '1', limit = '50' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('matches')
      .select(`
        id, status, confidence_score, confidence_reasons,
        discrepancy_amount, discrepancy_type, discrepancy_notes,
        resolution, resolution_notes, notes, flagged_reason,
        approved_by, approved_at, created_at, updated_at,
        check:checks (
          id, check_number, check_date, payee, amount, memo, file_url
        ),
        qb_txn:qb_transactions (
          id, txn_id, txn_type, txn_date, payee, amount, memo, account, doc_number
        )
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId);

    if (status && status !== 'all') {
      query = query.eq('status', status as string);
    }

    if (search) {
      // Search across check fields
      const s = search as string;
      query = query.or(
        `check.check_number.ilike.%${s}%,check.payee.ilike.%${s}%`
      );
    }

    switch (sort) {
      case 'confidence':
        query = query.order('confidence_score', { ascending: true });
        break;
      case 'amount':
        query = query.order('discrepancy_amount', { ascending: false, nullsFirst: false });
        break;
      case 'date':
        query = query.order('created_at', { ascending: false });
        break;
      default:
        query = query.order('confidence_score', { ascending: true });
    }

    query = query.range(offset, offset + parseInt(limit as string) - 1);

    const { data, count, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Get status counts for filter tabs
    const { data: counts } = await supabase
      .from('matches')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId);

    const statusCounts: Record<string, number> = (counts || []).reduce((acc: any, m: any) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json({
      matches: data,
      total: count,
      statusCounts,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error: any) {
    console.error('Matches fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
