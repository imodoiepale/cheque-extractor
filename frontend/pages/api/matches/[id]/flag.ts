import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/[id]/flag
 * Flag a match for review
 * Body: { reason: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { reason } = req.body;
    const { supabase, userId } = await getAuthContext(req);

    const { data: match } = await supabase
      .from('matches')
      .select('status, check_id')
      .eq('id', id)
      .single();
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const { error } = await supabase
      .from('matches')
      .update({ status: 'flagged', flagged_reason: reason })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await audit(supabase, id as string, userId, 'flagged', match.status, 'flagged', { reason });

    return res.status(200).json({ success: true, status: 'flagged' });
  } catch (error: any) {
    console.error('Flag error:', error);
    return res.status(500).json({ error: error.message });
  }
}
