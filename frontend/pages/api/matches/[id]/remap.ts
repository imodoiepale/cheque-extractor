import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';
import { scoreMatch } from '@/lib/matching-algorithm';

/**
 * POST /api/matches/[id]/remap
 * Re-assign a check to a different QB transaction
 * Body: { qbTxnId: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { qbTxnId } = req.body;
    const { supabase, userId } = await getAuthContext(req);

    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .single();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const { data: newTxn } = await supabase
      .from('qb_transactions')
      .select('*')
      .eq('id', qbTxnId)
      .single();
    if (!newTxn) return res.status(404).json({ error: 'QB transaction not found' });

    const { data: check } = await supabase
      .from('checks')
      .select('*')
      .eq('id', match.check_id)
      .single();

    // Re-score with the new transaction
    const result = scoreMatch(check, newTxn);
    const amtDiff = Math.abs((parseFloat(check?.amount) || 0) - (parseFloat(newTxn.amount) || 0));

    const newStatus = amtDiff > 0.01 ? 'discrepancy' : result.score >= 95 ? 'matched' : 'pending';

    const { error } = await supabase
      .from('matches')
      .update({
        qb_txn_id: qbTxnId,
        confidence_score: result.score,
        confidence_reasons: result.reasons,
        discrepancy_amount: amtDiff > 0.01 ? amtDiff : null,
        discrepancy_type: result.flags[0]?.type || null,
        status: newStatus,
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await audit(supabase, id as string, userId, 'remapped', match.status, newStatus, {
      oldTxnId: match.qb_txn_id,
      newTxnId: qbTxnId,
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Remap error:', error);
    return res.status(500).json({ error: error.message });
  }
}
