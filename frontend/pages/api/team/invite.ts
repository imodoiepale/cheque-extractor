import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { isDbRole } from '@/lib/roles';
import { createServiceClient } from '@/lib/supabase/api';
import { auditLog, inviteUrl, normaliseEmail } from '@/lib/team-helpers';

/**
 * POST /api/team/invite
 * Body:     { email: string, role: 'admin' | 'member' | 'viewer' }
 * Success:  200 { invitation: { id, email, role, expires_at }, invite_url }
 * Failure:  { error, message }  — the page renders `message`.
 *
 * Administrator only (capability `team.manage`).
 *
 * `team_invitations` already carries the token (32 random bytes, hex) and the
 * 7-day expiry as column defaults in 001_schema.sql, so neither is generated
 * here. The insert carries tenant_id explicitly and is additionally constrained
 * by the restrictive RLS policy added in migration 030.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  const ctx = await requireCapability(req, res, 'team.manage');
  if (!ctx) return;

  const email = normaliseEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
  }

  const role = req.body?.role ?? 'member';
  if (!isDbRole(role)) {
    return res.status(400).json({ error: 'invalid_role', message: 'Unknown role.' });
  }

  try {
    // Already a member of THIS firm? Cross-tenant membership is checked at
    // accept time, where we know who actually clicked the link.
    // Service client + explicit tenant filter: migration 010 limits
    // user_profiles SELECT to the caller's own row (see members/index.ts).
    const { data: existing, error: existingErr } = await createServiceClient()
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('email', email)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      return res.status(409).json({
        error: 'already_member',
        message: 'That person is already on your team.',
      });
    }

    // Re-inviting replaces the old pending invitation, so one email never has
    // two live tokens.
    const { error: clearErr } = await ctx.supabase
      .from('team_invitations')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('email', email)
      .eq('status', 'pending');
    if (clearErr) throw clearErr;

    const { data: invitation, error } = await ctx.supabase
      .from('team_invitations')
      .insert({
        tenant_id: ctx.tenantId,
        email,
        role,
        invited_by: ctx.userId,
        status: 'pending',
      })
      .select('id, email, role, status, token, expires_at, created_at')
      .single();

    if (error) throw error;
    // A 200 from the driver is not proof: assert on the parsed row.
    if (!invitation?.id || !invitation?.token) {
      throw new Error('Invitation insert returned no row — suspect RLS on team_invitations');
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'team.invite_created',
      entityType: 'team_invitation',
      entityId: invitation.id,
      newValues: { email, role },
    });

    const url = inviteUrl(invitation.token);

    // No mail transport is configured in this repo yet (no resend/nodemailer/
    // postmark dependency, and Supabase's inviteUserByEmail would create the
    // auth user outside this firm's tenant). The link is returned so the
    // Administrator can pass it on, and logged server-side. Wiring a transport
    // is a one-line swap here.
    console.log(`[team/invite] invitation for ${email} -> ${url}`);

    return res.status(200).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expires_at: invitation.expires_at,
      },
      invite_url: url,
      email_sent: false,
    });
  } catch (err: any) {
    console.error('[team/invite POST]', err);
    return res.status(500).json({
      error: 'server_error',
      message: err?.message || 'Failed to send invitation',
    });
  }
}
