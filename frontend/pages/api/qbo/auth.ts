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

    // Fallback to env vars if not in database
    const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
    const redirectUri = integration?.qb_redirect_uri || process.env.QUICKBOOKS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/qbo/callback`;
    
    if (!clientId) {
      return res.status(500).json({ 
        error: 'QuickBooks not configured',
        message: 'Please configure QuickBooks credentials in Settings → Integrations'
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
