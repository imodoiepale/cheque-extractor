import { createAuthenticatedClient, createServiceClient } from '@/lib/supabase/api';
import type { NextApiRequest } from 'next';

/**
 * Shared helpers for match API routes
 */

export async function getAuthContext(req: NextApiRequest) {
  const supabase = createAuthenticatedClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) throw new Error('No tenant found');

  return { supabase, userId: user.id, tenantId: profile.tenant_id };
}

export async function getActiveRealm(supabase: any, tenantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('qb_connections')
    .select('realm_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();
  return data?.realm_id || null;
}

export async function audit(
  supabase: any,
  matchId: string,
  userId: string,
  action: string,
  oldStatus: string | null,
  newStatus: string | null,
  details: Record<string, any> = {}
) {
  await supabase.from('match_audit_log').insert({
    match_id: matchId,
    user_id: userId,
    action,
    old_status: oldStatus,
    new_status: newStatus,
    details,
  });
}

export async function getValidToken(tenantId: string, realmId: string): Promise<string> {
  const serviceClient = createServiceClient();

  const { data: conn, error } = await serviceClient
    .from('qb_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('realm_id', realmId)
    .single();

  if (error || !conn) throw new Error('QB connection not found');

  const expiresAt = new Date(conn.token_expires_at);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Token still valid
  if (expiresAt > fiveMinutesFromNow) {
    return conn.access_token;
  }

  // Need to refresh — get credentials from integrations table
  const { data: integration } = await serviceClient
    .from('integrations')
    .select('qb_client_id, qb_client_secret')
    .eq('tenant_id', tenantId)
    .eq('provider', 'quickbooks')
    .single();

  const clientId = integration?.qb_client_id || process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = integration?.qb_client_secret || process.env.QUICKBOOKS_CLIENT_SECRET;

  if (!clientId || !clientSecret || !conn.refresh_token) {
    throw new Error('Cannot refresh token — missing credentials');
  }

  const refreshResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  });

  if (!refreshResponse.ok) {
    throw new Error('Token refresh failed');
  }

  const newToken = await refreshResponse.json();

  // Save refreshed token
  await serviceClient
    .from('qb_connections')
    .update({
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      token_expires_at: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('realm_id', realmId);

  return newToken.access_token;
}
