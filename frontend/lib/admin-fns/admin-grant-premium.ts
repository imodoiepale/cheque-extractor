import type { AdminFn } from './index';
import { audit, str } from './_shared';

// Same table and cap as /api/admin/comp-accounts (comp_grants, max 365 days).
const DAYS: Record<string, number> = { '7d': 7, '30d': 30, '3m': 90, '6m': 180, '1y': 365, lifetime: 365 };

/** DepthMe "grant premium" = a Kyriq comp grant on the user's firm. */
const grantPremium: AdminFn = async (body, ctx) => {
  const id = str(body.targetUserId);
  const duration = body.duration ?? null;
  if (!id) throw new Error('targetUserId required');
  if (duration !== null && !(typeof duration === 'string' && duration in DAYS)) {
    throw new Error("duration must be '7d'|'30d'|'3m'|'6m'|'1y'|'lifetime'|null");
  }
  const { db, user } = ctx;
  const { data: prof } = await db.from('user_profiles').select('tenant_id, email').eq('id', id).maybeSingle();
  const tenantId = (prof as { tenant_id: string | null } | null)?.tenant_id;
  if (!tenantId) throw new Error('User has no firm to comp');

  if (duration === null) {
    const { data, error } = await db.from('comp_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id, revoke_reason: 'revoked from admin console' })
      .eq('tenant_id', tenantId).is('revoked_at', null).select('id');
    if (error) throw new Error(error.message);
    await audit(ctx, 'admin.user.revoke_premium', { target_user_id: id, tenant_id: tenantId, revoked: data?.length ?? 0 });
    return { ok: true, revoked: data?.length ?? 0 };
  }

  const expires = new Date(Date.now() + DAYS[duration as string] * 86400_000).toISOString();
  const { data, error } = await db.from('comp_grants').insert({
    tenant_id: tenantId,
    granted_by: user.id,
    granted_by_email: user.email ?? 'super-admin',
    reason: `Admin console grant (${duration})`,
    expires_at: expires,
  }).select('id, tenant_id, expires_at').single();
  if (error) throw new Error(error.message);

  await audit(ctx, 'admin.user.grant_premium', { target_user_id: id, tenant_id: tenantId, duration, expires_at: expires });
  return { ok: true, grant: data, profile: { id, premium_grant_expires_at: expires, premium_grant_source: 'comp_grant' } };
};

export default grantPremium;
