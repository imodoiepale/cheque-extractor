import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabase = createAuthenticatedClient(req);

    if (req.method === 'GET') {
      // Fetch integration status from database
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'quickbooks')
        .single();

      // Fallback to env vars if not in database
      const qbClientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID || '';
      const qbClientSecret = integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET || '';
      const qbRedirectUri = integration?.qb_redirect_uri || process.env.QUICKBOOKS_REDIRECT_URI || '';
      
      // Check if credentials exist in database
      const credentialsExist = !!(integration?.qb_client_id && integration?.qb_client_secret);
      
      return res.status(200).json({
        qboConnected: !!integration?.access_token,
        qbConfigured: !!(qbClientId && qbClientSecret),
        credentialsExist: credentialsExist,
        qbClientId: qbClientId ? '••••••••' + qbClientId.slice(-6) : '',
        qbClientSecret: qbClientSecret ? '••••••••' : '',
        qbRedirectUri: qbRedirectUri,
        geminiApiKey: integration?.gemini_api_key || '',
        companyId: integration?.company_id || null,
        realmId: integration?.realm_id || null,
      });
    }

    if (req.method === 'PATCH') {
      // Update API keys and QB credentials
      const { geminiApiKey, qbClientId, qbClientSecret, qbRedirectUri } = req.body;

      // Get user's tenant_id
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('🔍 [PATCH] User:', { user_id: user?.id, email: user?.email, error: userError?.message });
      
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      console.log('🔍 [PATCH] Profile:', { 
        user_id: user.id, 
        tenant_id: profile?.tenant_id, 
        error: profileError?.message 
      });

      if (!profile?.tenant_id) {
        console.error('❌ [PATCH] No tenant_id found for user:', user.id);
        return res.status(400).json({ error: 'User has no tenant assigned' });
      }

      const updates: any = {};
      if (geminiApiKey !== undefined) updates.gemini_api_key = geminiApiKey;
      if (qbClientId !== undefined) updates.qb_client_id = qbClientId;
      if (qbClientSecret !== undefined) updates.qb_client_secret = qbClientSecret;
      if (qbRedirectUri !== undefined) updates.qb_redirect_uri = qbRedirectUri;
      updates.updated_at = new Date().toISOString();

      // Upsert integration record with tenant_id
      const { error } = await supabase
        .from('integrations')
        .upsert({
          provider: 'quickbooks',
          tenant_id: profile.tenant_id,
          ...updates,
        }, {
          onConflict: 'tenant_id,provider'
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
