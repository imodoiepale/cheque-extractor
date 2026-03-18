import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/[id]/resolve-discrepancy
 * Resolve an amount discrepancy
 * Body: { resolution: 'use_check_amount' | 'use_qb_amount' | 'manual_override', amount?: number, notes?: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { resolution, amount, notes } = req.body;
    const { supabase, userId } = await getAuthContext(req);

    const { data: match } = await supabase
      .from('matches')
      .select('*, check:checks(*), qb_txn:qb_transactions(*)')
      .eq('id', id)
      .single();

    if (!match) return res.status(404).json({ error: 'Match not found' });

    let resolvedAmount: number | null = null;
    if (resolution === 'use_check_amount') resolvedAmount = match.check?.amount;
    else if (resolution === 'use_qb_amount') resolvedAmount = match.qb_txn?.amount;
    else if (resolution === 'manual_override') resolvedAmount = amount;

    const { error } = await supabase
      .from('matches')
      .update({
        status: 'approved',
        resolution,
        resolution_notes: notes,
        discrepancy_notes: `Resolved: ${resolution}. Final amount: $${resolvedAmount}`,
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await audit(supabase, id as string, userId, 'discrepancy_resolved', 'discrepancy', 'approved', {
      resolution,
      resolvedAmount,
      notes,
    });

    return res.status(200).json({ success: true, status: 'approved', resolvedAmount });
  } catch (error: any) {
    console.error('Resolve discrepancy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
