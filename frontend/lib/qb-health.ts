/**
 * QuickBooks connection health.
 *
 * `qb_connections.is_active` means "the company currently selected" — migration
 * 013 puts a unique partial index on it, so exactly one row per tenant can be
 * active and it can never carry health. Migration 034 adds a real `status`
 * column, and this is the only writer.
 *
 * THERE ARE ELEVEN COPIES of the QuickBooks token exchange in frontend/, each
 * with its own `grant_type: 'refresh_token'` fetch. markQbConnection() below is
 * the ONE way a caller marks a connection unhealthy, so migrating the rest is
 * eleven calls to add and not eleven policies to re-decide. Wired so far — the
 * two paths that actually read qb_connections, the multi-company source of
 * truth:
 *
 *   - getValidToken()        in lib/match-helpers.ts         (match + reconcile)
 *   - refreshAccessToken()   in pages/api/qbo/pull-checks.ts (QBO sync)
 *
 * NOT wired, deliberately: extension/qb/refresh-token.ts, qbo/accounts.ts,
 * clear-transaction.ts, company-info.ts, create-check.ts, diagnose.ts,
 * explore.ts, preview.ts, update-transaction.ts. Four of those read only the
 * legacy `integrations` table and so do not know which company they are
 * talking about; fixing that is a separate parcel.
 *
 * scripts/check-email.ts asserts the call is present in both wired paths,
 * because a dead connection that nothing records is invisible until a customer
 * trips over it, and emails 11/12/13 have nothing to fire on.
 */
import { createServiceClient } from '@/lib/supabase/api';

export type QbConnectionStatus =
  | 'connected'
  | 'needs_reconnect'
  | 'error'
  | 'revoked'
  | 'unknown';

/**
 * The only two statuses that justify emailing a firm "reconnect QuickBooks".
 *
 * 'unconfigured is honest' applied to health, the same property the mail
 * transport has: when we could not find out — no client credentials, Intuit
 * unreachable, the column missing because migration 034 is unapplied — the
 * answer is 'unknown', never 'needs_reconnect'. A connection wrongly marked
 * dead sends a working firm a reconnect email, which is worse than silence.
 */
export const EMAILABLE_STATUSES: QbConnectionStatus[] = ['needs_reconnect', 'revoked'];

export function warrantsReconnectEmail(status: unknown): boolean {
  return EMAILABLE_STATUSES.includes(status as QbConnectionStatus);
}

/**
 * Write connection health for one realm.
 *
 * Best-effort and never throws: a health write must not turn a working sync
 * into a failed request. It is logged loudly instead, and a missing column
 * (migration 034 unapplied) is reported once per call rather than crashing the
 * caller.
 *
 * `tenantId` is optional because one of the two refresh paths only knows the
 * realm. Passing it narrows the update, which matters: a realm can in
 * principle be connected by two firms.
 */
export async function markQbConnection(args: {
  realmId: string;
  status: QbConnectionStatus;
  detail?: string | null;
  tenantId?: string | null;
  /** Pass the caller's client when it already has one; defaults to service. */
  client?: any;
}): Promise<boolean> {
  const { realmId, status, detail = null, tenantId = null } = args;
  if (!realmId) return false;

  const now = new Date().toISOString();
  try {
    const db = args.client ?? createServiceClient();
    let q = db
      .from('qb_connections')
      .update({
        status,
        status_detail: detail ? String(detail).slice(0, 500) : null,
        status_checked_at: now,
        status_changed_at: now,
      })
      .eq('realm_id', realmId);
    if (tenantId) q = q.eq('tenant_id', tenantId);

    const { error } = await q;
    if (error) {
      console.error(`[qb-health] could not record status=${status} for realm ${realmId}:`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[qb-health] status write threw:', err?.message);
    return false;
  }
}

/**
 * Which failures mean "only the user can fix this".
 *
 * Intuit answers a dead or revoked refresh token with 400 `invalid_grant`.
 * A 5xx or a network error is transient and must not tell a customer to
 * reconnect a connection that is fine — that is how a working firm gets told
 * to re-do OAuth during an Intuit outage.
 */
export function classifyRefreshFailure(status: number | null, body: string | null): QbConnectionStatus {
  const text = String(body || '').toLowerCase();
  if (/invalid_grant|unauthorized_client/.test(text)) return 'needs_reconnect';
  if (/revoked/.test(text)) return 'revoked';
  if (status === 400 || status === 401 || status === 403) return 'needs_reconnect';
  // 5xx, 429, or no status at all (network). Transient, and NOT emailable:
  // telling a firm to redo OAuth during an Intuit outage is a false alarm.
  if (status === null || status === undefined) return 'unknown';
  return 'error';
}
