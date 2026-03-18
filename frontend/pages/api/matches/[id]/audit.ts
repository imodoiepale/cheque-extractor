import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';

/**
 * GET /api/matches/[id]/audit
 * Get the full audit history for a match
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    const { supabase } = await getAuthContext(req);

    const { data, error } = await supabase
      .from('match_audit_log')
      .select('*')
      .eq('match_id', id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ audit: data });
  } catch (error: any) {
    console.error('Audit fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
}
