import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';

/**
 * GET /api/usage/trial-status
 *
 * The one endpoint the trial meter reads. Everything comes from
 * public.tenant_usage_state() (migration 029) so the number the UI shows and
 * the number the gate enforces cannot drift apart.
 *
 * Response:
 *   {
 *     plan, subscriptionStatus,
 *     daysRemaining,            // null once subscribed
 *     checksRemaining,          // null when unlimited
 *     checksUsedThisPeriod,
 *     trialChecksUsed, trialCheckLimit, trialEndsAt,
 *     billingPeriodStart, billingPeriodEnd, planCheckAllowance,
 *     processingAllowed, blockReason,
 *     isComped, compExpiresAt, compReason
 *   }
 *
 * History is never gated by this: a tenant whose trial is over still reads
 * every past job. This endpoint only reports.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    return res.status(401).json({ error: 'unauthenticated', message: err?.message });
  }

  // Called with the user's own token, so the function's caller check passes
  // only for their own tenant — a tampered tenantId cannot read another firm.
  const { data, error } = await ctx.supabase.rpc('tenant_usage_state', {
    p_tenant_id: ctx.tenantId,
  });

  if (error) {
    console.error('trial-status: tenant_usage_state failed', error);
    return res.status(500).json({ error: 'usage_state_unavailable', message: error.message });
  }
  if (!data || typeof data !== 'object') {
    return res.status(500).json({ error: 'usage_state_unavailable' });
  }

  const s = data as Record<string, any>;

  return res.status(200).json({
    tenantId: ctx.tenantId,
    plan: s.plan ?? null,
    subscriptionStatus: s.subscription_status ?? null,

    daysRemaining: s.days_remaining ?? null,
    checksRemaining: s.checks_remaining ?? null,
    checksUsedThisPeriod: s.checks_used_this_period ?? 0,

    trialEndsAt: s.trial_ends_at ?? null,
    trialCheckLimit: s.trial_check_limit ?? null,
    trialChecksUsed: s.trial_checks_used ?? 0,

    billingPeriodStart: s.billing_period_start ?? null,
    billingPeriodEnd: s.billing_period_end ?? null,
    planCheckAllowance: s.plan_check_allowance ?? null,

    processingAllowed: s.processing_allowed === true,
    blockReason: s.block_reason ?? null,

    isComped: s.is_comped === true,
    compExpiresAt: s.comp_expires_at ?? null,
    compReason: s.comp_reason ?? null,
    compCheckLimit: s.comp_check_limit ?? null,
    compChecksUsed: s.comp_checks_used ?? null,

    asOf: s.as_of ?? new Date().toISOString(),
  });
}
