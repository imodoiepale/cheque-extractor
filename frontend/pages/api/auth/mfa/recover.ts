import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { auditLog } from '@/lib/team-helpers';
import { hashRecoveryCode } from '@/lib/mfa';

/**
 * POST /api/auth/mfa/recover
 * Body: { code: string }
 *
 * Lost-authenticator recovery. The caller is already past the password step
 * (they hold an aal1 session) but cannot reach aal2. A valid single-use
 * recovery code unenrols their TOTP factors so they can enrol a new
 * authenticator; it does NOT itself grant aal2, because only a real factor
 * challenge can do that. The /mfa page then walks them through re-enrolment.
 *
 * Success: 200 { ok: true, removed: n, remaining_codes: n }
 * Failure: 400 invalid_code (same response whether the code is unknown or
 *          already used — no oracle), 401 unauthenticated.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'unauthenticated', message: err?.message });
  }

  const raw = req.body?.code;
  if (typeof raw !== 'string' || raw.trim().length < 8 || raw.length > 64) {
    return res.status(400).json({ error: 'invalid_code', message: 'That recovery code is not valid.' });
  }

  try {
    const service = createServiceClient();
    const hash = hashRecoveryCode(raw);

    // Single statement, so a replayed code cannot be redeemed twice by two
    // concurrent requests: the `is('used_at', null)` filter is the guard.
    const { data: redeemed, error } = await service
      .from('mfa_recovery_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', ctx.userId)
      .eq('code_hash', hash)
      .is('used_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;

    if (!redeemed) {
      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: 'mfa.recovery_failed',
        entityType: 'mfa_recovery_codes',
        entityId: ctx.userId,
        metadata: { email: ctx.email },
      });
      return res.status(400).json({ error: 'invalid_code', message: 'That recovery code is not valid.' });
    }

    const { data: factorData, error: listErr } = await service.auth.admin.mfa.listFactors({
      userId: ctx.userId,
    });
    if (listErr) throw listErr;

    let removed = 0;
    for (const factor of factorData?.factors || []) {
      const { error: delErr } = await service.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: ctx.userId,
      });
      if (delErr) {
        console.error('[mfa/recover] could not delete factor', factor.id, delErr.message);
      } else {
        removed += 1;
      }
    }

    await service
      .from('user_profiles')
      .update({ mfa_enrolled_at: null })
      .eq('id', ctx.userId);

    const { count } = await service
      .from('mfa_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .is('used_at', null);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'mfa.recovery_used',
      entityType: 'mfa_recovery_codes',
      entityId: ctx.userId,
      oldValues: { factors_removed: removed },
      metadata: { email: ctx.email },
    });

    return res.status(200).json({ ok: true, removed, remaining_codes: count ?? 0 });
  } catch (err: any) {
    console.error('[mfa/recover]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message });
  }
}
