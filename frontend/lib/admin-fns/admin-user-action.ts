import type { AdminCtx, AdminFn } from './index';
import { audit, isSuperAdminUser, str } from './_shared';
import { deleteBlockers } from './delete-blockers';
import { isMissingSchema } from '@/lib/billing/service';

/**
 * Removes a login and its firm's data, or refuses and changes nothing.
 * ponytail: files in storage and the Stripe customer record are left behind.
 * Upgrade path: remove them here if a retention rule ever requires it.
 */
async function deleteAccount(id: string, ctx: AdminCtx): Promise<Record<string, unknown>> {
  const { db } = ctx;
  const { data: authData, error: authErr } = await db.auth.admin.getUserById(id);
  if (authErr || !authData.user) throw new Error(`User not found${authErr ? `: ${authErr.message}` : ''}`);
  const email = authData.user.email ?? null;

  const { data: profile, error: profileErr } = await db.from('user_profiles').select('tenant_id').eq('id', id).maybeSingle();
  if (profileErr) throw new Error(`Could not read the profile, so nothing was deleted: ${profileErr.message}`);
  const tenantId = (profile as { tenant_id: string | null } | null)?.tenant_id ?? null;

  const countFor = async (table: string) => {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    if (error) throw new Error(`Could not check ${table}, so nothing was deleted: ${error.message}`);
    return count ?? 0;
  };

  let firmName: string | null = null;
  let facts = { otherMembers: 0, stripeSubscriptionId: null as string | null, subscriptionStatus: null as string | null, usageRows: 0, invoices: 0, refunds: 0, trialClaims: 0 };
  if (tenantId) {
    const { data: tenant, error: tenantErr } = await db.from('tenants')
      .select('name, stripe_subscription_id, subscription_status').eq('id', tenantId).maybeSingle();
    if (tenantErr) throw new Error(`Could not read the firm, so nothing was deleted: ${tenantErr.message}`);
    const t = tenant as { name: string | null; stripe_subscription_id: string | null; subscription_status: string | null } | null;
    firmName = t?.name ?? null;
    const [members, usageRows, invoices, refunds, trialClaims] = await Promise.all([
      countFor('user_profiles'), countFor('usage_ledger'), countFor('billing_invoices'), countFor('billing_refunds'), countFor('qb_realm_trials'),
    ]);
    facts = {
      otherMembers: Math.max(members - 1, 0),
      stripeSubscriptionId: t?.stripe_subscription_id ?? null,
      subscriptionStatus: t?.subscription_status ?? null,
      usageRows, invoices, refunds, trialClaims,
    };
  }

  const reasons = deleteBlockers({ ...facts, isSuperAdmin: isSuperAdminUser(authData.user, email) });
  if (reasons.length) throw new Error(`This account can't be deleted because ${reasons.join(', ')}. Suspend it instead.`);

  if (tenantId) {
    // These two foreign keys have no cascade (migration 008). The rows come back on the next sync.
    for (const table of ['qb_entries', 'quickbooks_entries']) {
      const { error } = await db.from(table).delete().eq('tenant_id', tenantId);
      if (error && !isMissingSchema(error)) throw new Error(`Could not clear ${table}, so the account was kept: ${error.message}`);
    }
    const { error } = await db.from('tenants').delete().eq('id', tenantId);
    if (error) throw new Error(`Could not delete the firm, so the account was kept: ${error.message}`);
  }

  const details = { target_email: email, firm_name: firmName, tenant_id: tenantId };
  const { error: loginErr } = await db.auth.admin.deleteUser(id);
  if (loginErr) {
    await audit(ctx, 'admin.user.delete_partial', { target_user_id: id, ...details, error: loginErr.message });
    throw new Error(`The firm's data was deleted, but the login could not be removed: ${loginErr.message}`);
  }
  return details;
}

const userAction: AdminFn = async (body, ctx) => {
  const id = str(body.targetUserId) ?? str(body.userId);
  const action = str(body.action);
  if (!id || !action) throw new Error('userId and action required');
  if (id === ctx.user.id && action !== 'reset_password') throw new Error('You cannot run this action on yourself.');
  const { db } = ctx;

  let message: string;
  let link: string | undefined;
  let details: Record<string, unknown> = {};
  switch (action) {
    case 'suspend':
    case 'unsuspend': {
      const { error } = await db.auth.admin.updateUserById(id, { ban_duration: action === 'suspend' ? '876000h' : 'none' });
      if (error) throw new Error(error.message);
      message = action === 'suspend' ? 'User suspended' : 'User unsuspended';
      break;
    }
    case 'reset_password': {
      const { data: u, error: uErr } = await db.auth.admin.getUserById(id);
      if (uErr || !u.user?.email) throw new Error('User has no email');
      const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email: u.user.email });
      if (error) throw new Error(error.message);
      link = data.properties?.action_link;
      message = 'Password reset link generated (not emailed). Copy it from the response.';
      break;
    }
    case 'delete': {
      details = await deleteAccount(id, ctx);
      message = 'Account deleted';
      break;
    }
    default:
      throw new Error('Unknown action');
  }

  await audit(ctx, `admin.user.${action}`, { target_user_id: id, reason: str(body.reason) ?? null, ...details });
  return { ok: true, message, ...(link ? { link } : {}) };
};

export default userAction;
