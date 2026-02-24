import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * QuickBooks OAuth Authentication Endpoint
 * Initiates OAuth flow for QuickBooks Online
 * Reads credentials from database instead of environment variables
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get QuickBooks credentials from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: integration, error: dbError } = await supabase
      .from('integrations')
      .select('qb_client_id, qb_redirect_uri')
      .eq('provider', 'quickbooks')
      .single();

    console.log('🔍 QB OAuth - Integration data:', {
      hasIntegration: !!integration,
      hasClientId: !!integration?.qb_client_id,
      hasRedirectUri: !!integration?.qb_redirect_uri,
      dbError: dbError?.message
    });

    // Fallback to env vars if not in database
    const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
    const redirectUri = integration?.qb_redirect_uri || process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3080/api/qbo/callback';
    
    console.log('🔑 QB OAuth - Using credentials:', {
      clientId: clientId ? `${clientId.substring(0, 10)}...` : 'MISSING',
      redirectUri,
      source: integration?.qb_client_id ? 'database' : 'env'
    });
    
    if (!clientId) {
      console.error('❌ QB OAuth - No client ID found in database or environment');
      return res.status(400).json({ 
        error: 'QuickBooks OAuth not configured',
        detail: 'QuickBooks Client ID is missing. Please save your credentials in Settings → Integrations → Configure Credentials',
        configured: false
      });
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    
    // Store state in session/cookie for verification
    res.setHeader('Set-Cookie', `qbo_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);

    // QuickBooks OAuth URL
    const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('scope', 'com.intuit.quickbooks.accounting');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    return res.status(200).json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('QuickBooks auth error:', error);
    return res.status(500).json({ error: 'Failed to initiate QuickBooks connection' });
  }
}
