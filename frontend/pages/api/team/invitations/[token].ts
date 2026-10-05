import type { NextApiRequest, NextApiResponse } from 'next';
import { createServiceClient } from '@/lib/supabase/api';
import { toDbRole } from '@/lib/roles';

export type InvitationState =
  | 'valid'
  | 'accepted'
  | 'expired'
  | 'not_found'
  | 'revoked';

/**
 * GET /api/team/invitations/[token]
 *
 * Unauthenticated on purpose: the token IS the credential, and the accept page
 * has to be able to say "this invite is for a@b.com, sign in as them" before
 * anyone is signed in.
 *
 * Response: { state, email?, role?, firm?, expires_at? }
 * Never returns the token back, the tenant id, or anything about other members.
 *
 * Read with the service client because migration 030 gives team_invitations a
 * restrictive tenant+Administrator policy, so anon gets zero rows — which is
 * the point. There is no anon read path to this table.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  // The column default is encode(gen_random_bytes(32),'hex') — 64 hex chars.
  if (!token || !/^[0-9a-f]{32,128}$/i.test(token)) {
    return res.status(404).json({ state: 'not_found' as InvitationState });
  }

  try {
    const service = createServiceClient();
    const { data: invitation, error } = await service
      .from('team_invitations')
      .select('id, tenant_id, email, role, status, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!invitation) {
      return res.status(404).json({ state: 'not_found' as InvitationState });
    }

    const { data: tenant } = await service
      .from('tenants')
      .select('name')
      .eq('id', invitation.tenant_id)
      .maybeSingle();

    const base = {
      email: invitation.email,
      role: toDbRole(invitation.role),
      firm: tenant?.name || 'this firm',
      expires_at: invitation.expires_at,
    };

    if (invitation.status === 'accepted') {
      return res.status(200).json({ state: 'accepted' as InvitationState, ...base });
    }
    if (invitation.status === 'expired') {
      return res.status(200).json({ state: 'expired' as InvitationState, ...base });
    }
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
      // Lazily settle the status so the list endpoint and this agree.
      await service.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
      return res.status(200).json({ state: 'expired' as InvitationState, ...base });
    }

    return res.status(200).json({ state: 'valid' as InvitationState, ...base });
  } catch (err: any) {
    console.error('[team/invitations GET]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message });
  }
}
