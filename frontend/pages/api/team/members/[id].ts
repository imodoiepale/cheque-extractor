import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { isDbRole, toDbRole } from '@/lib/roles';
import { auditLog, decodeMemberId, isUuid, profileRowToMember } from '@/lib/team-helpers';

/**
 * DELETE /api/team/members/[id]  — remove a member, or cancel an invitation
 * PATCH  /api/team/members/[id]  — body { role } ; 200 { member: TeamMemberDTO }
 *
 * `id` is either a user_profiles.id or `invite_<team_invitations.id>` (see
 * lib/team-helpers.ts) because the team page renders both in one list and
 * routes both here.
 *
 * Administrator only (capability `team.manage`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'DELETE, PATCH');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  const ctx = await requireCapability(req, res, 'team.manage');
  if (!ctx) return;

  const raw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!raw) {
    return res.status(400).json({ error: 'missing_id', message: 'Member id is required.' });
  }

  const target = decodeMemberId(raw);
  if (!isUuid(target.id)) {
    return res.status(400).json({ error: 'invalid_id', message: 'Member id is not valid.' });
  }

  try {
    // ── Pending invitation ────────────────────────────────────────────────
    if (target.kind === 'invitation') {
      if (req.method === 'DELETE') {
        const { data, error } = await ctx.supabase
          .from('team_invitations')
          .delete()
          .eq('id', target.id)
          .eq('tenant_id', ctx.tenantId)
          .select('id, email')
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          return res.status(404).json({ error: 'not_found', message: 'Invitation not found.' });
        }
        await auditLog({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          action: 'team.invite_cancelled',
          entityType: 'team_invitation',
          entityId: data.id,
          oldValues: { email: data.email },
        });
        return res.status(200).json({ ok: true, removed: 'invitation' });
      }

      const nextRole = req.body?.role;
      if (!isDbRole(nextRole)) {
        return res.status(400).json({ error: 'invalid_role', message: 'Unknown role.' });
      }
      const { data, error } = await ctx.supabase
        .from('team_invitations')
        .update({ role: nextRole })
        .eq('id', target.id)
        .eq('tenant_id', ctx.tenantId)
        .select('id, email, role, created_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'not_found', message: 'Invitation not found.' });
      }
      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'team.invite_role_changed',
        entityType: 'team_invitation',
        entityId: data.id,
        newValues: { email: data.email, role: nextRole },
      });
      return res.status(200).json({
        member: {
          id: raw,
          email: data.email,
          name: '',
          role: toDbRole(data.role),
          status: 'pending' as const,
          invited_at: data.created_at,
        },
      });
    }

    // ── Existing member ──────────────────────────────────────────────────
    // Service client + explicit tenant filter: migration 010 limits
    // user_profiles SELECT to the caller's own row, so an Administrator cannot
    // read a teammate with their own client. See members/index.ts.
    const service = createServiceClient();

    const { data: member, error: readErr } = await service
      .from('user_profiles')
      .select('id, email, full_name, role, created_at')
      .eq('id', target.id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!member) {
      return res.status(404).json({ error: 'not_found', message: 'Team member not found.' });
    }

    if (member.id === ctx.userId) {
      return res.status(409).json({
        error: 'self_target',
        message:
          req.method === 'DELETE'
            ? 'You cannot remove yourself.'
            : 'You cannot change your own role.',
      });
    }

    // Removing or demoting the last Administrator would lock the firm out of
    // billing, reports and team management.
    const demoting =
      req.method === 'DELETE'
        ? toDbRole(member.role) === 'admin'
        : toDbRole(member.role) === 'admin' && req.body?.role !== 'admin';

    if (demoting) {
      const { count, error: countErr } = await service
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', ctx.tenantId)
        .eq('role', 'admin');
      if (countErr) throw countErr;
      if ((count ?? 0) <= 1) {
        return res.status(409).json({
          error: 'last_admin',
          message: 'A firm must keep at least one Administrator.',
        });
      }
    }

    // Writes use the same service client, for the same reason: the self-only
    // UPDATE policy from migration 010 would block an Administrator editing
    // someone else's row, and migration 030's trigger blocks the client-side
    // role-change path outright.
    if (req.method === 'DELETE') {
      const { data, error } = await service
        .from('user_profiles')
        .delete()
        .eq('id', target.id)
        .eq('tenant_id', ctx.tenantId)
        .select('id, email')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'not_found', message: 'Team member not found.' });
      }

      // Revoke the login too, otherwise the account survives the removal.
      const { error: authErr } = await service.auth.admin.deleteUser(target.id);
      if (authErr) console.error('[team/members DELETE] auth user not removed:', authErr.message);

      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'team.member_removed',
        entityType: 'user_profile',
        entityId: data.id,
        oldValues: { email: data.email, role: toDbRole(member.role) },
        metadata: { auth_deleted: !authErr },
      });
      return res.status(200).json({ ok: true, removed: 'member' });
    }

    const nextRole = req.body?.role;
    if (!isDbRole(nextRole)) {
      return res.status(400).json({ error: 'invalid_role', message: 'Unknown role.' });
    }

    const { data: updated, error } = await service
      .from('user_profiles')
      .update({ role: nextRole })
      .eq('id', target.id)
      .eq('tenant_id', ctx.tenantId)
      .select('id, email, full_name, role, created_at')
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new Error('Role update returned no row — the write did not persist');
    }
    if (toDbRole(updated.role) !== nextRole) {
      throw new Error(`Role update did not persist (still ${updated.role})`);
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'team.member_role_changed',
      entityType: 'user_profile',
      entityId: updated.id,
      oldValues: { role: toDbRole(member.role) },
      newValues: { role: nextRole },
      metadata: { email: updated.email },
    });

    return res.status(200).json({ member: profileRowToMember(updated) });
  } catch (err: any) {
    console.error(`[team/members ${req.method}]`, err);
    return res.status(500).json({ error: 'server_error', message: err?.message || 'Request failed' });
  }
}
