import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { auditLog } from '@/lib/team-helpers';
import { RECOVERY_CODE_COUNT, generateRecoveryCode, hashRecoveryCode } from '@/lib/mfa';

/**
 * POST /api/auth/mfa/recovery-codes
 *
 * Issues ten single-use recovery codes for the caller's own account and
 * replaces any unused ones. Supabase TOTP has no built-in backup codes, so
 * these are ours: hashed with SHA-256 and stored in mfa_recovery_codes, which
 * migration 030 gives a restrictive `USING (false)` policy — neither anon nor
 * authenticated can read it, only the service key.
 *
 * Success: 200 { codes: string[], count: 10 }
 * The plaintext is returned exactly once and never stored.
 *
 * Any role may call this for themselves; it is not an Administrator action.
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

  try {
    const service = createServiceClient();

    // Only issue codes to someone who actually has a verified factor,
    // otherwise the codes are a standing bypass of nothing.
    const { data: factorData, error: factorErr } = await service.auth.admin.mfa.listFactors({
      userId: ctx.userId,
    });
    if (factorErr) throw factorErr;
    const verified = (factorData?.factors || []).filter((f: any) => f.status === 'verified');
    if (verified.length === 0) {
      return res.status(409).json({
        error: 'not_enrolled',
        message: 'Finish setting up your authenticator app first.',
      });
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

    const { error: clearErr } = await service
      .from('mfa_recovery_codes')
      .delete()
      .eq('user_id', ctx.userId)
      .is('used_at', null);
    if (clearErr) throw clearErr;

    const { data: inserted, error } = await service
      .from('mfa_recovery_codes')
      .insert(
        codes.map((code) => ({
          tenant_id: ctx!.tenantId,
          user_id: ctx!.userId,
          code_hash: hashRecoveryCode(code),
        }))
      )
      .select('id');
    if (error) throw error;
    // A 200 is not proof: assert the rows landed.
    if ((inserted?.length ?? 0) !== RECOVERY_CODE_COUNT) {
      throw new Error(
        `Stored ${inserted?.length ?? 0} of ${RECOVERY_CODE_COUNT} recovery codes — suspect RLS on mfa_recovery_codes`
      );
    }

    await service
      .from('user_profiles')
      .update({ mfa_enrolled_at: new Date().toISOString() })
      .eq('id', ctx.userId);

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: 'mfa.recovery_codes_issued',
      entityType: 'mfa_recovery_codes',
      entityId: ctx.userId,
      newValues: { count: RECOVERY_CODE_COUNT },
      metadata: { email: ctx.email },
    });

    return res.status(200).json({ codes, count: RECOVERY_CODE_COUNT });
  } catch (err: any) {
    console.error('[mfa/recovery-codes]', err);
    return res.status(500).json({ error: 'server_error', message: err?.message });
  }
}
