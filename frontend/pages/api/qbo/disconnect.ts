import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * QuickBooks Disconnect Endpoint
 * Revokes QuickBooks connection and removes stored tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete QuickBooks integration
    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('provider', 'quickbooks');

    if (error) {
      console.error('Failed to disconnect QuickBooks:', error);
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    return res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
}
