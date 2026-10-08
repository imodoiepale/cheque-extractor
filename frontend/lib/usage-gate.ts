import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthContext } from '@/lib/match-helpers';

/**
 * The server-side trial gate for the processing proxies.
 *
 * 14 days or 250 successfully processed cheques, whichever comes first
 * (CHECKLIST sections 1 and 6). A live comp grant overrides both.
 *
 * All of that is resolved by one database function, public.tenant_usage_state()
 * (migration 029), so the meter the UI draws and the gate that blocks work are
 * reading the same row. Nothing here restricts reading history — only the two
 * routes that start work call it.
 *
 * Returns null when the request was rejected (the response is already written),
 * otherwise the context the proxy needs to forward the call.
 */
export interface ProcessingGateResult {
  tenantId: string;
  userId: string;
  /** Bearer token to forward, so the backend can attribute the usage ledger. */
  accessToken: string | null;
  state: Record<string, any>;
}

export async function requireProcessingAllowed(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<ProcessingGateResult | null> {
  let ctx;
  try {
    ctx = await getAuthContext(req);
  } catch (err: any) {
    res.status(401).json({ error: 'unauthenticated', message: err?.message || 'Not authenticated' });
    return null;
  }

  const { data, error } = await ctx.supabase.rpc('tenant_usage_state', {
    p_tenant_id: ctx.tenantId,
  });

  if (error || !data || typeof data !== 'object') {
    // Fail CLOSED. An unreadable usage state is the one case where guessing
    // "allowed" hands out free processing that the ledger can never bill.
    console.error('usage-gate: tenant_usage_state unavailable', error);
    res.status(503).json({
      error: 'usage_state_unavailable',
      message: 'Could not confirm your plan status. Please try again shortly.',
    });
    return null;
  }

  const state = data as Record<string, any>;

  if (state.processing_allowed !== true) {
    // 402, not 403: this is "trial over / payment needed", not "wrong role".
    res.status(402).json({
      error: 'processing_disabled',
      reason: state.block_reason ?? null,
      daysRemaining: state.days_remaining ?? 0,
      checksRemaining: state.checks_remaining ?? 0,
      checksUsedThisPeriod: state.checks_used_this_period ?? 0,
      isComped: state.is_comped === true,
      message:
        state.block_reason === 'trial_check_limit_reached'
          ? 'Your free trial has used all 250 cheques. Your history stays available.'
          : state.block_reason === 'trial_expired'
          ? 'Your 14-day free trial has ended. Your history stays available.'
          : state.block_reason === 'realm_trial_already_used'
          ? // Migration 037: one trial per QuickBooks company. Say which rule was
            // hit, otherwise this reads as a bug to someone on day one.
            'This QuickBooks company has already used its free trial. Choose a plan to continue. Your history stays available.'
          : 'Processing is disabled for this account. Your history stays available.',
    });
    return null;
  }

  const accessToken =
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : (await ctx.supabase.auth.getSession()).data.session?.access_token) ?? null;

  return { tenantId: ctx.tenantId, userId: ctx.userId, accessToken, state };
}
