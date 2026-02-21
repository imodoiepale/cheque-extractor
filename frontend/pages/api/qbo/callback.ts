import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * QuickBooks OAuth Callback Endpoint
 * Handles the OAuth callback and exchanges code for tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, realmId } = req.query;

    if (!code || !state || !realmId) {
      return res.redirect('/settings?error=missing_params');
    }

    // Verify state (CSRF protection)
    const cookies = req.headers.cookie?.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies?.qbo_state !== state) {
      return res.redirect('/settings?error=invalid_state');
    }

    // Get QuickBooks credentials from database
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: integration } = await supabase
      .from('integrations')
      .select('qb_client_id, qb_client_secret, qb_redirect_uri')
      .eq('provider', 'quickbooks')
      .single();

    // Fallback to env vars
    const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;
    const redirectUri = integration?.qb_redirect_uri || process.env.QUICKBOOKS_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/qbo/callback`;

    if (!clientId || !clientSecret) {
      return res.redirect('/settings?tab=integrations&error=not_configured');
    }

    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return res.redirect('/settings?error=token_exchange_failed');
    }

    const tokens = await tokenResponse.json();

    // Store tokens in Supabase
    const { error } = await supabase
      .from('integrations')
      .upsert({
        provider: 'quickbooks',
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Failed to store tokens:', error);
      return res.redirect('/settings?error=storage_failed');
    }

    // Clear state cookie
    res.setHeader('Set-Cookie', 'qbo_state=; Path=/; HttpOnly; Max-Age=0');

    // Redirect to settings with success
    return res.redirect('/settings?tab=integrations&success=quickbooks_connected');
  } catch (error) {
    console.error('QuickBooks callback error:', error);
    return res.redirect('/settings?error=callback_failed');
  }
}
