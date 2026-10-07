import { createClientFromRequest, createServiceClient } from '@/lib/supabase/api';
import { can, toDbRole, type Capability, type DbRole } from '@/lib/roles';
import { getQbAccessToken } from '@/lib/qb-token';
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
  // One resolver (lib/qb-token.ts) for every QuickBooks token in the app.
  // This site keeps its exception contract and its 5-minute window: the match
  // engine makes many QBO calls per run off one token, so a token with four
  // minutes left is not good enough here.
  const { accessToken } = await getQbAccessToken(createServiceClient(), {
    tenantId,
    realmId,
    skewMs: 5 * 60 * 1000,
  });
  return accessToken;
}
