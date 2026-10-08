import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import {
  invitationRowToMember,
  profileRowToMember,
  type TeamMemberDTO,
} from '@/lib/team-helpers';

/**
 * GET /api/team/members
 *
 * Response: { members: TeamMemberDTO[] }
 * Shape is dictated by app/(app)/settings/team/page.tsx, which was already
 * calling this endpoint before it existed.
 *
 * Administrator only (capability `team.view`). Reads go through the caller's
 * own RLS-bound client, so tenant isolation is enforced by the database as
 * well as by the explicit .eq('tenant_id', ...) below.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  const ctx = await requireCapability(req, res, 'team.view');
  if (!ctx) return;

  try {
    // user_profiles reads use the service client with an explicit tenant filter.
    // Migration 010 restricts SELECT on user_profiles to `id = auth.uid()` to
    // avoid the RLS recursion it was written to fix, so an Administrator cannot
    // list their own teammates with their own client — it would return exactly
    // one row. Adding a tenant-read policy there would re-introduce that
    // recursion, so the authorisation is the capability gate above plus the
    // .eq('tenant_id', ctx.tenantId) on every query below.
    const service = createServiceClient();

    const [profilesRes, invitesRes] = await Promise.all([
      service
        .from('user_profiles')
        .select('id, email, full_name, role, created_at')
        .eq('tenant_id', ctx.tenantId)
        .order('created_at', { ascending: true }),
      ctx.supabase
        .from('team_invitations')
        .select('id, email, role, status, created_at, expires_at')
        .eq('tenant_id', ctx.tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (invitesRes.error) throw invitesRes.error;

    const now = Date.now();
    const members: TeamMemberDTO[] = [
      ...(profilesRes.data || []).map(profileRowToMember),
      // A pending invitation past its 7-day window is not offered as pending.
      ...(invitesRes.data || [])
        .filter((row: any) => !row.expires_at || new Date(row.expires_at).getTime() > now)
        .map(invitationRowToMember),
    ];

    return res.status(200).json({ members });
  } catch (err: any) {
    console.error('[team/members GET]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message || 'Failed to load team' });
  }
}
