import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorised, isMissingSchema, service } from '@/lib/billing/service';
import { planByKey } from '@/lib/billing/plans';

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
 * WHAT IT DOES NOT DO: send email. Resend, the sending domain and SPF/DKIM/
 * DMARC are CHECKLIST section 9 and do not exist yet, so the notice is
 * recorded with channel 'in_app' and the row is what the billing page reads.
 * When the mailer lands, send from these rows; the idempotency is already here.
 *
 * Auth: BILLING_CRON_SECRET.
 */
const REMINDER_KIND = 'annual_renewal_30d';
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
  const failures: string[] = [];

  for (const tenant of due) {
    const renewalDate = String(tenant.paid_through).slice(0, 10);
    const plan = planByKey(tenant.plan);

    const { error: insertError } = await svc.from('billing_notices').insert({
      tenant_id: tenant.id,
      kind: REMINDER_KIND,
      period_key: renewalDate,
      channel: 'in_app',
      metadata: {
        renewal_date: renewalDate,
        plan: tenant.plan ?? null,
        amount_usd: plan?.annual ?? null,
        days_ahead: Math.ceil((new Date(tenant.paid_through).getTime() - now.getTime()) / 86400_000),
        delivery: 'recorded_only_no_mailer',
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
  }

  return res.status(failures.length ? 207 : 200).json({
    kind: REMINDER_KIND,
    windowDays: WINDOW_DAYS,
    due: due.length,
    recorded,
    alreadySent,
    failures: failures.slice(0, 20),
    emailSent: false,
    note: 'Notices are recorded only. No mail is sent until CHECKLIST section 9 (Resend + SPF/DKIM/DMARC) is in place.',
  });
}
