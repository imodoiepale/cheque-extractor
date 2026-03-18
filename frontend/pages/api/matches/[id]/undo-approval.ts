import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/[id]/undo-approval
 * Reverse an approval (put back to previous state)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { supabase, userId } = await getAuthContext(req);

    const { data: match } = await supabase
      .from('matches')
      .select('*, check:checks(*)')
      .eq('id', id)
      .single();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const revertStatus = match.confidence_score >= 95 ? 'matched' : 'pending';

    const { error } = await supabase
      .from('matches')
      .update({ status: revertStatus, approved_by: null, approved_at: null })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await audit(supabase, id as string, userId, 'approval_undone', 'approved', revertStatus);

    return res.status(200).json({ success: true, status: revertStatus });
  } catch (error: any) {
    console.error('Undo approval error:', error);
    return res.status(500).json({ error: error.message });
  }
}
