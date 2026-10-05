import type { NextApiRequest, NextApiResponse } from 'next';
import { createClientFromRequest, createServiceClient } from '@/lib/supabase/api';
import { toDbRole } from '@/lib/roles';
import { auditLog } from '@/lib/team-helpers';

/**
 * POST /api/team/invitations/[token]/accept
 *
 * Requires a signed-in user (the invitee). Outcomes, all of which the accept
 * page renders:
 *   200 { ok: true, firm, role }          — joined
 *   401 { error: 'unauthenticated' }      — sign in first
 *   404 { error: 'not_found' }
 *   409 { error: 'already_accepted' }
 *   410 { error: 'expired' }
 *   403 { error: 'wrong_email', expected } — signed in as someone else
 *   409 { error: 'already_member' }        — already in another firm with data
 *
 * Writes go through the service client: the invitee is not yet a member of the
 * target tenant, so by construction no tenant-scoped RLS policy can authorise
 * the write. The token is the authorisation, and every write below pins
 * tenant_id explicitly.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (!token || !/^[0-9a-f]{32,128}$/i.test(token)) {
    return res.status(404).json({ error: 'not_found', message: 'This invitation link is not valid.' });
  }

  let userId: string;
  let userEmail: string;
  try {
    const supabase = await createClientFromRequest(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Not authenticated');
    userId = user.id;
    userEmail = user.email.toLowerCase();
  } catch {
    return res.status(401).json({ error: 'unauthenticated', message: 'Sign in to accept this invitation.' });
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
      return res.status(404).json({ error: 'not_found', message: 'This invitation link is not valid.' });
    }

    if (invitation.status === 'accepted') {
      return res.status(409).json({
        error: 'already_accepted',
        message: 'This invitation has already been used.',
      });
    }

    const expired =
      invitation.status === 'expired' ||
      (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now());
    if (expired) {
      await service.from('team_invitations').update({ status: 'expired' }).eq('id', invitation.id);
      return res.status(410).json({
        error: 'expired',
        message: 'This invitation has expired. Ask your Administrator to send a new one.',
      });
    }

    if (invitation.email.toLowerCase() !== userEmail) {
      return res.status(403).json({
        error: 'wrong_email',
        message: `This invitation was sent to ${invitation.email}. You are signed in as ${userEmail}.`,
        expected: invitation.email,
      });
    }

    const { data: profile } = await service
      .from('user_profiles')
      .select('id, tenant_id, role')
      .eq('id', userId)
      .maybeSingle();

    const role = toDbRole(invitation.role);
    const { data: tenant } = await service
      .from('tenants')
      .select('name')
      .eq('id', invitation.tenant_id)
      .maybeSingle();

    if (profile && profile.tenant_id === invitation.tenant_id) {
      // Idempotent: already in the right firm, just settle the invitation.
      await service
        .from('team_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id);
      return res.status(200).json({ ok: true, firm: tenant?.name || null, role: toDbRole(profile.role) });
    }

    if (profile) {
      // Signup auto-creates a tenant per user (handle_new_user, migration 007),
      // so a brand-new invitee always arrives owning an empty firm of their own.
      // Moving them is safe only if that firm is genuinely theirs alone and has
      // no work in it. Anything else is a real second firm -> refuse.
      const [{ count: siblingCount }, { count: jobCount }] = await Promise.all([
        service
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', profile.tenant_id),
        service
          .from('check_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', profile.tenant_id),
      ]);

      const isEmptySoloFirm = (siblingCount ?? 0) <= 1 && (jobCount ?? 0) === 0;
      if (!isEmptySoloFirm) {
        return res.status(409).json({
          error: 'already_member',
          message:
            'This account already belongs to another firm with data in it. ' +
            'Accept the invitation from a different account, or ask that firm to remove you first.',
        });
      }

      const previousTenant = profile.tenant_id;
      const { data: moved, error: moveErr } = await service
        .from('user_profiles')
        .update({ tenant_id: invitation.tenant_id, role })
        .eq('id', userId)
        .select('id, tenant_id, role')
        .maybeSingle();
      if (moveErr) throw moveErr;
      if (!moved || moved.tenant_id !== invitation.tenant_id) {
        throw new Error('Joining the firm did not persist — suspect RLS on user_profiles');
      }

      // Drop the abandoned single-user tenant so it stops appearing in the
      // Super Admin firm list as a phantom account.
      await service.from('tenants').delete().eq('id', previousTenant);

      await service.from('team_invitations').update({ status: 'accepted' }).eq('id', invitation.id);
      await auditLog({
        tenantId: invitation.tenant_id,
        userId,
        action: 'team.invitation_accepted',
        entityType: 'team_invitation',
        entityId: invitation.id,
        newValues: { email: userEmail, role },
        metadata: { moved_from: previousTenant },
      });
      return res.status(200).json({ ok: true, firm: tenant?.name || null, role });
    }

    // No profile row at all (trigger did not fire): create one in the firm.
    const { data: created, error: createErr } = await service
      .from('user_profiles')
      .insert({
        id: userId,
        tenant_id: invitation.tenant_id,
        email: userEmail,
        role,
      })
      .select('id, tenant_id, role')
      .maybeSingle();
    if (createErr) throw createErr;
    if (!created || created.tenant_id !== invitation.tenant_id) {
      throw new Error('Profile creation did not persist — suspect RLS on user_profiles');
    }

    await service.from('team_invitations').update({ status: 'accepted' }).eq('id', invitation.id);
    await auditLog({
      tenantId: invitation.tenant_id,
      userId,
      action: 'team.invitation_accepted',
      entityType: 'team_invitation',
      entityId: invitation.id,
      newValues: { email: userEmail, role },
      metadata: { created_profile: true },
    });

    return res.status(200).json({ ok: true, firm: tenant?.name || null, role });
  } catch (err: any) {
    console.error('[team/invitations accept]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message || 'Could not accept invitation' });
  }
}
