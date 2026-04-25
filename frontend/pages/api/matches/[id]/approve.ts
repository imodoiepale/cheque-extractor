import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/[id]/approve
 * Approve a single match
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { notes } = req.body || {};
    const { supabase, userId } = await getAuthContext(req);

    const { data: match } = await supabase
      .from('matches')
      .select('status, check_id, notes')
      .eq('id', id)
      .single();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('matches')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: now,
        notes: notes || match.notes,
      })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    // Sync the parent check so the matching algorithm won't re-process it.
    if (match.check_id) {
      await supabase
        .from('checks')
        .update({ status: 'approved' })
        .eq('id', match.check_id);
    }

    await audit(supabase, id as string, userId, 'approved', match.status, 'approved', { notes });

    return res.status(200).json({ success: true, status: 'approved' });
  } catch (error: any) {
    console.error('Approve error:', error);
    return res.status(500).json({ error: error.message });
  }
}
