import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext, audit } from '@/lib/match-helpers';

/**
 * POST /api/matches/[id]/note
 * Add or update an internal note on a match
 * Body: { note: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { note } = req.body;
    const { supabase, userId } = await getAuthContext(req);

    const { error } = await supabase
      .from('matches')
      .update({ notes: note })
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });

    await audit(supabase, id as string, userId, 'note_added', null, null, { note });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Note error:', error);
    return res.status(500).json({ error: error.message });
  }
}
