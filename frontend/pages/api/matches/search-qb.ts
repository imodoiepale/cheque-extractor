import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, getActiveRealm } from '@/lib/match-helpers';

/**
 * POST /api/matches/search-qb
 * Search QB transactions to manually match an unmatched check
 * Body: { query: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { supabase, tenantId } = await getAuthContext(req);
    const realmId = await getActiveRealm(supabase, tenantId);
    const { query } = req.body;

    if (!query?.trim()) return res.json({ results: [] });

    const { data, error } = await supabase
      .from('qb_transactions')
      .select('id, txn_id, txn_type, txn_date, payee, amount, memo, account, doc_number')
      .eq('tenant_id', tenantId)
      .eq('realm_id', realmId)
      .or(`payee.ilike.%${query}%,doc_number.ilike.%${query}%,memo.ilike.%${query}%`)
      .order('txn_date', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ results: data || [] });
  } catch (error: any) {
    console.error('Search QB error:', error);
    return res.status(500).json({ error: error.message });
  }
}
