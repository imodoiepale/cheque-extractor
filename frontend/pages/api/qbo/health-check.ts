import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorised, isMissingSchema, service } from '@/lib/billing/service';
import { getValidToken } from '@/lib/match-helpers';
import { markQbConnection, warrantsReconnectEmail, type QbConnectionStatus } from '@/lib/qb-health';
import { adminRecipients, sendOnce } from '@/lib/email/send';

/**
 * POST /api/qbo/health-check   (cron / operator)
 *
 * The scheduled QuickBooks connection health check that CHECKLIST section 9
 * names as a prerequisite for emails 11/12/13 — and, as the review says, worth
 * having regardless of the emails: before this, a dead connection was invisible
 * until a customer clicked something and got an error.
 *
 * How it checks, and why this way:
 *
 *   It calls getValidToken() from lib/match-helpers.ts — the existing refresh
 *   path — and then reads companyinfo. It deliberately does NOT perform its own
 *   token exchange. Intuit ROTATES the refresh token on every refresh, so a
 *   health check with its own exchange that discarded the new token would break
 *   the connection it was checking. There are already eleven copies of that
 *   exchange in this codebase; this is not a twelfth.
 *
 * Honest when it cannot find out. A connection is only marked
 * 'needs_reconnect' or 'revoked' — the two statuses that email a firm — when
 * Intuit actually rejected the stored grant. Absent credentials, a 5xx, a
 * network failure or an unapplied migration all record 'unknown' and send
 * nothing. A firm wrongly told to redo OAuth is worse than silence.
 *
 * Schedule: hourly is plenty. Send-once in billing_notices means an hourly run
 * cannot nag.
 *
 * Auth: BILLING_CRON_SECRET — the same shared secret as the billing crons,
 * deliberately, because a second secret is a second thing to misconfigure.
 */
const QBO_BASE = 'https://quickbooks.api.intuit.com';
const EMAIL_KIND = 'qb_connection_unhealthy';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET is allowed because Vercel Cron invokes a route with GET; POST stays for
  // a manual or external trigger. Either way cronAuthorised() is the gate.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!cronAuthorised(req)) {
    return res.status(401).json({ error: 'unauthorised', message: 'BILLING_CRON_SECRET required.' });
  }

  const svc = service();
  const { data: connections, error } = await svc
    .from('qb_connections')
    .select('id, tenant_id, realm_id, company_name, status');

  if (error) {
    if (isMissingSchema(error)) {
      // Could be qb_connections itself, or the status column from 034. Either
      // way we learned nothing, so nothing is marked and nothing is emailed.
      return res.status(409).json({
        error: 'qb_health_schema_missing',
        message:
          'qb_connections or its status column is absent. Apply ' +
          'supabase/migrations/034_email_and_qb_health.sql. No connection was marked and no email was sent.',
        detail: error.message,
      });
    }
    return res.status(500).json({ error: 'server_error', message: error.message });
  }

  const checked: Array<{ realmId: string; status: QbConnectionStatus; emailed: number }> = [];
  const failures: string[] = [];

  for (const conn of connections || []) {
    let status: QbConnectionStatus = 'unknown';
    let detail: string | null = null;

    try {
      // Refreshes and PERSISTS if needed, and writes its own status on failure.
      const token = await getValidToken(conn.tenant_id, conn.realm_id);

      const probe = await fetch(
        `${QBO_BASE}/v3/company/${conn.realm_id}/companyinfo/${conn.realm_id}?minorversion=73`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );

      if (probe.ok) {
        status = 'connected';
      } else if (probe.status === 401 || probe.status === 403) {
        status = 'needs_reconnect';
        detail = `QuickBooks rejected the stored authorisation (${probe.status}).`;
      } else {
        // 429, 5xx, a maintenance window. Transient: do not accuse the firm.
        status = 'unknown';
        detail = `Health probe inconclusive (${probe.status}).`;
      }
    } catch (err: any) {
      const message = String(err?.message || 'refresh failed');
      if (/missing credentials/i.test(message)) {
        status = 'unknown';
        detail = 'QuickBooks credentials are not configured for this firm.';
      } else if (/connection not found/i.test(message)) {
        status = 'unknown';
        detail = message;
      } else if (/refresh failed/i.test(message)) {
        // getValidToken already classified and wrote this one from Intuit's
        // own response, which is better evidence than anything available here.
        const { data: fresh } = await svc
          .from('qb_connections')
          .select('status, status_detail')
          .eq('tenant_id', conn.tenant_id)
          .eq('realm_id', conn.realm_id)
          .maybeSingle();
        status = (fresh?.status as QbConnectionStatus) || 'unknown';
        detail = fresh?.status_detail ?? message;
      } else {
        status = 'unknown';
        detail = message;
      }
    }

    const written = await markQbConnection({
      tenantId: conn.tenant_id,
      realmId: conn.realm_id,
      status,
      detail,
    });
    if (!written) failures.push(`${conn.realm_id}: status write failed`);

    let emailed = 0;
    if (warrantsReconnectEmail(status)) {
      const day = new Date().toISOString().slice(0, 10);
      for (const to of await adminRecipients(conn.tenant_id)) {
        const result = await sendOnce({
          tenantId: conn.tenant_id,
          kind: EMAIL_KIND,
          // At most one per administrator per realm per status per day.
          periodKey: `${conn.realm_id}:${status}:${day}:${to}`,
          to,
          template: 'qb_disconnected',
          vars: { companyName: conn.company_name, statusDetail: detail },
          metadata: { realm_id: conn.realm_id, status },
        });
        if (result.sent) emailed += 1;
        else if (result.status === 'failed') failures.push(`${to}: ${result.reason}`);
      }
    }

    checked.push({ realmId: conn.realm_id, status, emailed });
  }

  const unhealthy = checked.filter((c) => warrantsReconnectEmail(c.status)).length;

  return res.status(failures.length ? 207 : 200).json({
    checked: checked.length,
    healthy: checked.filter((c) => c.status === 'connected').length,
    unhealthy,
    unknown: checked.filter((c) => c.status === 'unknown').length,
    emailsSent: checked.reduce((n, c) => n + c.emailed, 0),
    connections: checked,
    failures: failures.slice(0, 20),
  });
}
