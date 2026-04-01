// v2
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow Chrome extension origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { connectionId, refreshToken } = req.body;
    if (!connectionId || !refreshToken) {
      return res.status(400).json({ error: 'connectionId and refreshToken are required' });
    }

    // Verify the connection belongs to this user's tenant.
    // Try user_profiles first; fall back to profiles for legacy users.
    let profile: { tenant_id: string } | null = null;
    const { data: upData } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();
    profile = upData;

    if (!profile?.tenant_id) {
      const { data: legacyData } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();
      profile = legacyData;
    }

    if (!profile?.tenant_id) {
      return res.status(403).json({ error: 'No tenant assigned' });
    }

    const { data: conn } = await supabase
      .from('qb_connections')
      .select('id, realm_id')
      .eq('id', connectionId)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!conn) {
      return res.status(403).json({ error: 'Connection not found or access denied' });
    }

    // Resolve QB credentials — per-tenant integration record takes priority over env vars
    const { data: integration } = await supabase
      .from('integrations')
      .select('qb_client_id, qb_client_secret')
      .eq('provider', 'quickbooks')
      .maybeSingle();

    const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'QuickBooks credentials not configured on server' });
    }

    // Call Intuit token endpoint
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('QB token refresh failed:', errText);
      return res.status(502).json({ error: 'Token refresh failed — reconnect QuickBooks' });
    }

    const tokens = await tokenRes.json();

    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Persist new tokens to qb_connections (primary multi-company store)
    await supabase
      .from('qb_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: newExpiresAt,
      })
      .eq('id', connectionId);

    // Also sync back to integrations for backward compatibility (pull-checks.ts fallback)
    await supabase
      .from('integrations')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'quickbooks')
      .eq('tenant_id', profile.tenant_id);

    return res.status(200).json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (error: any) {
    console.error('Extension QB refresh error:', error);
    return res.status(500).json({ error: error.message });
  }
}
