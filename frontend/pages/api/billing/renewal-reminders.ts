import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorised, isMissingSchema, service } from '@/lib/billing/service';
import { planByKey } from '@/lib/billing/plans';
import { adminRecipients, sendOnce } from '@/lib/email/send';

/**
 * POST /api/billing/renewal-reminders   (cron / operator)
 *
 * "Renewal reminder roughly 30 days before an annual charge" (CHECKLIST
 * section 7).
 *
 * Finds annual subscriptions whose paid_through falls inside the next 30 days
 * and that are still set to renew, and records ONE notice per renewal in
 * billing_notices. `period_key` is the renewal date, so the UNIQUE constraint
 * (tenant_id, kind, period_key) makes this send-once per renewal — a cron that
 * runs hourly cannot nag daily, and that guarantee is a database constraint
 * rather than a timestamp comparison in this file.
 *
 * It then emails each administrator of the firm the annual_renewal_reminder
 * template through sendOnce(), which claims its own billing_notices row before
 * sending — so the same UNIQUE constraint, not a timestamp, is what stops an
 * hourly cron mailing the customer twice. The email claim uses a separate kind
 * and a per-recipient period_key, so the in-app notice above and each
 * administrator's email are independent once-only facts: one admin added after
 * the first run still gets told, and nobody gets told twice.
 *
 * With no RESEND_API_KEY, sendEmail() records 'skipped_unconfigured' and
 * sendOnce() releases the claim, so the first run after a key is configured
 * sends for real. The in-app notice is unaffected either way.
 *
 * Auth: BILLING_CRON_SECRET.
 */
const REMINDER_KIND = 'annual_renewal_30d';
const EMAIL_KIND = 'annual_renewal_30d_email';
const WINDOW_DAYS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!cronAuthorised(req)) {
    return res.status(401).json({ error: 'unauthorised', message: 'BILLING_CRON_SECRET required.' });
  }

  const svc = service();
  const now = new Date();
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 86400_000);

  const { data: tenants, error } = await svc
    .from('tenants')
    .select('id, name, plan, billing_frequency, paid_through, cancel_at_period_end, subscription_status')
    .eq('billing_frequency', 'annual')
    .eq('subscription_status', 'active')
    .not('paid_through', 'is', null)
    .gte('paid_through', now.toISOString())
    .lte('paid_through', horizon.toISOString());

  if (error) {
    if (isMissingSchema(error)) {
      return res.status(409).json({
        error: 'billing_schema_missing',
        message: 'Apply supabase/migrations/033_stripe_billing.sql first.',
      });
    }
    return res.status(500).json({ error: 'server_error', message: error.message });
  }

  const due = (tenants || []).filter((t: any) => t.cancel_at_period_end !== true);
  let recorded = 0;
  let alreadySent = 0;
  let emailsSent = 0;
  let emailsAlreadySent = 0;
  let emailsSkipped = 0;
  const failures: string[] = [];

  for (const tenant of due) {
    const renewalDate = String(tenant.paid_through).slice(0, 10);
    const plan = planByKey(tenant.plan);
    const daysAhead = Math.ceil(
      (new Date(tenant.paid_through).getTime() - now.getTime()) / 86400_000
    );

    const { error: insertError } = await svc.from('billing_notices').insert({
      tenant_id: tenant.id,
      kind: REMINDER_KIND,
      period_key: renewalDate,
      channel: 'in_app',
      metadata: {
        renewal_date: renewalDate,
        plan: tenant.plan ?? null,
        amount_usd: plan?.annual ?? null,
        days_ahead: daysAhead,
      },
    });

    if (!insertError) {
      recorded += 1;
      // 23505 is unique_violation: billing_notices_once already holds a row for
      // this tenant and this renewal date, so the reminder has gone out. The
      // constraint is what makes this send-once, not a timestamp comparison.
    } else if (insertError.code === '23505' || /duplicate key/i.test(insertError.message)) {
      alreadySent += 1;
    } else {
      failures.push(`${tenant.id}: ${insertError.message}`);
    }

    // The email is claimed per administrator, independently of the in-app
    // notice above: a duplicate in-app row must not suppress the mail, and a
    // failed mail must not suppress the row.
    for (const to of await adminRecipients(tenant.id)) {
      const result = await sendOnce({
        tenantId: tenant.id,
        kind: EMAIL_KIND,
        periodKey: `${renewalDate}:${to}`,
        to,
        template: 'annual_renewal_reminder',
        vars: {
          firmName: tenant.name,
          renewalDate,
          planLabel: plan?.name ?? null,
          amountUsd: plan?.annual ?? null,
          daysAhead,
        },
        metadata: { renewal_date: renewalDate, plan: tenant.plan ?? null },
      });

      if (result.sent) emailsSent += 1;
      else if (result.status === 'already_sent') emailsAlreadySent += 1;
      else if (result.status === 'skipped_unconfigured' || result.status === 'suppressed')
        emailsSkipped += 1;
      else failures.push(`${tenant.id} email ${to}: ${result.reason || result.status}`);
    }
  }

  return res.status(failures.length ? 207 : 200).json({
    kind: REMINDER_KIND,
    windowDays: WINDOW_DAYS,
    due: due.length,
    recorded,
    alreadySent,
    failures: failures.slice(0, 20),
    emailsSent,
    emailsAlreadySent,
    emailsSkipped,
    note: 'Each firm gets one in-app notice per renewal and one email per administrator per renewal. With no RESEND_API_KEY the email is recorded as skipped_unconfigured and retried on the next run.',
  });
}
