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
    /* Trust boundary: page/limit arrive from the query string. A NaN would make
       `range()` throw, and a negative offset would silently return nothing.
       The ceiling is 2000, matching the grid's largest per-page option — the
       up-to-200-record view must never be capped below what the UI offers. */
    const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
    const pageSize = Math.min(2000, Math.max(1, Math.floor(Number(limit)) || 50));
    const offset = (pageNum - 1) * pageSize;

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

    /**
     * `status` accepts a comma-separated list, because the Review step's
     * "Needs Attention" tab is the UNION of four statuses (see
     * NEEDS_ATTENTION_STATUSES in lib/batch-state.ts) and filtering that set
     * client-side would make `total` — and therefore pagination — wrong.
     */
    if (status && status !== 'all') {
      const wanted = String(status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (wanted.length === 1) query = query.eq('status', wanted[0]);
      else if (wanted.length > 1) query = query.in('status', wanted);
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

    query = query.range(offset, offset + pageSize - 1);

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
      page: pageNum,
      limit: pageSize,
    });
  } catch (error: any) {
    console.error('Matches fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
