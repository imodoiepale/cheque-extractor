import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (req.method === 'GET') {
      // Fetch integration status from database
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'quickbooks')
        .single();

      return res.status(200).json({
        qboConnected: !!integration?.access_token,
        qbClientId: integration?.qb_client_id || '',
        qbClientSecret: integration?.qb_client_secret || '',
        qbRedirectUri: integration?.qb_redirect_uri || '',
        geminiApiKey: integration?.gemini_api_key || '',
      });
    }

    if (req.method === 'PATCH') {
      // Update API keys and QB credentials
      const { geminiApiKey, qbClientId, qbClientSecret, qbRedirectUri } = req.body;

      const updates: any = {};
      if (geminiApiKey !== undefined) updates.gemini_api_key = geminiApiKey;
      if (qbClientId !== undefined) updates.qb_client_id = qbClientId;
      if (qbClientSecret !== undefined) updates.qb_client_secret = qbClientSecret;
      if (qbRedirectUri !== undefined) updates.qb_redirect_uri = qbRedirectUri;
      updates.updated_at = new Date().toISOString();

      // Upsert integration record
      const { error } = await supabase
        .from('integrations')
        .upsert({
          provider: 'quickbooks',
          ...updates,
        }, {
          onConflict: 'provider'
        });

      if (error) {
        console.error('Failed to update integrations:', error);
        return res.status(500).json({ error: 'Failed to update settings' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Integration API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
