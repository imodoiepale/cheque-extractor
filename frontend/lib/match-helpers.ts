import { createClientFromRequest, createServiceClient } from '@/lib/supabase/api';
import { can, toDbRole, type Capability, type DbRole } from '@/lib/roles';
import { classifyRefreshFailure, markQbConnection } from '@/lib/qb-health';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Shared helpers for match API routes — and now the shared auth+tenant+role
 * resolver for every authenticated API route. There is deliberately only one.
 */

export interface AuthContext {
  supabase: any;
  userId: string;
  tenantId: string;
  email: string | null;
  role: DbRole;
  /** Authenticator Assurance Level of this session: 'aal1' | 'aal2'. */
  aal: string | null;
}

/** Read the `aal` claim without re-verifying: getUser() already validated it. */
function readAal(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString('utf8')
    );
    return typeof payload?.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

export async function getAuthContext(req: NextApiRequest): Promise<AuthContext> {
  const supabase = await createClientFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) throw new Error('No tenant found');

  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (await supabase.auth.getSession()).data.session?.access_token;

  return {
    supabase,
    userId: user.id,
    tenantId: profile.tenant_id,
    email: user.email ?? null,
    role: toDbRole(profile.role),
    aal: readAal(bearer),
  };
}

/**
 * Server-side role gate. Resolves the caller, checks the capability against
 * lib/roles.ts, and writes the response itself on failure.
 *
 * Returns null when the request was rejected, so a handler reads:
 *   const ctx = await requireCapability(req, res, 'team.manage');
 *   if (!ctx) return;
 *
 * This is the enforcement the acceptance test hits: calling the endpoint
 * directly as a User gets 403 regardless of what the UI shows. RLS in
 * migration 030 is the second, independent gate.
 */
export async function requireCapability(
  req: NextApiRequest,
  res: NextApiResponse,
  capability: Capability
): Promise<AuthContext | null> {
  let ctx: AuthContext;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    res.status(401).json({
      error: 'unauthenticated',
      message: err?.message || 'Not authenticated',
    });
    return null;
  }

  if (!can(ctx.role, capability)) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Administrators only.',
      required: capability,
      role: ctx.role,
    });
    return null;
  }

  return ctx;
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
    // Refresh path 1 of 2. Nothing used to be persisted here, so a dead
    // connection stayed invisible until a user clicked something.
    await markQbConnection({
      tenantId,
      realmId,
      // 'unknown', not 'needs_reconnect': absent credentials are OUR
      // misconfiguration, and a firm must not be emailed "reconnect
      // QuickBooks" for something only we can fix.
      status: 'unknown',
      detail: 'Cannot refresh token — missing QuickBooks credentials',
    });
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
    const body = await refreshResponse.text().catch(() => '');
    await markQbConnection({
      tenantId,
      realmId,
      status: classifyRefreshFailure(refreshResponse.status, body),
      detail: `Token refresh failed (${refreshResponse.status})`,
    });
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

  // A recovered connection must clear its own status, or one transient Intuit
  // 500 leaves a healthy firm flagged forever and emails them about it.
  await markQbConnection({ tenantId, realmId, status: 'connected', detail: null });

  return newToken.access_token;
}
