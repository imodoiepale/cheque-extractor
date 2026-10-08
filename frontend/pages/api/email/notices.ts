import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorised, isMissingSchema, planLabel, service } from '@/lib/billing/service';
import { adminRecipients, sendOnce } from '@/lib/email/send';
import type { TemplateKey } from '@/lib/email/templates';

/**
 * POST /api/email/notices   (cron / operator)
 *
 * The scheduled sender. Three passes, each independent, each reporting its own
 * outcome so one broken pass does not hide the other two:
 *
 *   A. Invitations that have expired            (email 03)
 *   B. Documents that failed to process         (email 14)
 *   C. Trial and usage notices                  (billing 01-06, 08-11)
 *
 * Pass C takes every number from public.tenant_usage_state() — the same
 * resolver the server-side processing gate calls — so an email cannot tell a
 * firm it is blocked while the gate lets it through, or the reverse. The
 * precedence between comp, paid and trial lives in that function (migration
 * 029) and is not reimplemented here.
 *
 * Send-once is a database constraint in every case: billing_notices'
 * UNIQUE (tenant_id, kind, period_key). Run this hourly or daily; a second run
 * in the same period is a no-op.
 *
 * Auth: BILLING_CRON_SECRET.
 */
const DAY = 86400_000;

/** Fractions of the allowance that get a nudge. Highest match wins. */
const HALF = 0.5;
const NEARLY = 0.8;
/** "Ends soon" window, in days. */
const ENDING_SOON_DAYS = 3;

interface Outcome {
  sent: number;
  alreadySent: number;
  suppressed: number;
  skipped: number;
  failures: string[];
}

const outcome = (): Outcome => ({ sent: 0, alreadySent: 0, suppressed: 0, skipped: 0, failures: [] });

function record(o: Outcome, label: string, r: { sent: boolean; status: string; reason: string | null }) {
  if (r.sent) o.sent += 1;
  else if (r.status === 'already_sent') o.alreadySent += 1;
  else if (r.status === 'suppressed') o.suppressed += 1;
  else if (r.status === 'skipped_unconfigured') o.skipped += 1;
  else o.failures.push(`${label}: ${r.reason ?? r.status}`);
}

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

  const only = typeof req.query.pass === 'string' ? req.query.pass : null;
  const svc = service();
  const now = new Date();

  const invitations = only && only !== 'invitations' ? null : await expiredInvitations(svc, now);
  const jobs = only && only !== 'jobs' ? null : await failedJobs(svc, now);
  const usage = only && only !== 'usage' ? null : await usageNotices(svc);

  const all = [invitations, jobs, usage].filter(Boolean) as Outcome[];
  const anyFailure = all.some((o) => o.failures.length > 0);

  return res.status(anyFailure ? 207 : 200).json({
    at: now.toISOString(),
    invitations,
    jobs,
    usage,
    note:
      'skipped counts emails that were rendered and recorded but not sent because RESEND_API_KEY ' +
      'is unset. Their send-once claim is released, so they go out on the next run once a key exists.',
  });
}

/* ── Pass A: invitations that have expired ──────────────────────────────── */

async function expiredInvitations(svc: any, now: Date): Promise<Outcome> {
  const o = outcome();

  const { data, error } = await svc
    .from('team_invitations')
    .select('id, tenant_id, email, expires_at, status')
    .eq('status', 'pending')
    .lt('expires_at', now.toISOString())
    .limit(500);

  if (error) {
    o.failures.push(isMissingSchema(error) ? 'team_invitations is absent in this database' : error.message);
    return o;
  }

  for (const inv of data || []) {
    // Settle the row first: the invitation is dead whether or not mail works.
    const { error: updateError } = await svc
      .from('team_invitations')
      .update({ status: 'expired' })
      .eq('id', inv.id)
      .eq('status', 'pending');
    if (updateError) {
      o.failures.push(`${inv.id}: ${updateError.message}`);
      continue;
    }

    const firm = await firmName(svc, inv.tenant_id);
    const result = await sendOnce({
      tenantId: inv.tenant_id,
      kind: 'team_invitation_expired',
      periodKey: inv.id,
      to: String(inv.email).toLowerCase(),
      template: 'team_invitation_expired',
      vars: { firmName: firm, expiresAt: inv.expires_at },
    });
    record(o, inv.email, result);
  }

  return o;
}

/* ── Pass B: documents that failed to process ──────────────────────────── */

async function failedJobs(svc: any, now: Date): Promise<Outcome> {
  const o = outcome();

  // A window, not "all history": switching this on must not mail every firm
  // about every failure since the app was built.
  const since = new Date(now.getTime() - 7 * DAY).toISOString();

  const { data, error } = await svc
    .from('check_jobs')
    .select('id, tenant_id, pdf_name, error_message, updated_at')
    .eq('status', 'error')
    .gte('updated_at', since)
    .limit(500);

  if (error) {
    o.failures.push(isMissingSchema(error) ? 'check_jobs is absent in this database' : error.message);
    return o;
  }

  for (const job of data || []) {
    if (!job.tenant_id) continue;
    const firm = await firmName(svc, job.tenant_id);
    for (const to of await adminRecipients(job.tenant_id)) {
      const result = await sendOnce({
        tenantId: job.tenant_id,
        kind: 'processing_failed',
        periodKey: `${job.id}:${to}`,
        to,
        template: 'processing_failed',
        vars: {
          firmName: firm,
          documentName: job.pdf_name,
          errorMessage: job.error_message,
          jobId: job.id,
        },
        metadata: { job_id: job.id },
      });
      record(o, `${job.id}/${to}`, result);
    }
  }

  return o;
}

/* ── Pass C: trial and usage ───────────────────────────────────────────── */

async function usageNotices(svc: any): Promise<Outcome> {
  const o = outcome();

  const { data: tenants, error } = await svc.from('tenants').select('id, name').limit(2000);
  if (error) {
    o.failures.push(error.message);
    return o;
  }

  for (const tenant of tenants || []) {
    const { data: state, error: stateError } = await svc.rpc('tenant_usage_state', {
      p_tenant_id: tenant.id,
    });

    if (stateError) {
      o.failures.push(
        isMissingSchema(stateError)
          ? 'tenant_usage_state() is absent — apply migrations 026-029 first'
          : `${tenant.id}: ${stateError.message}`
      );
      // One missing function means every tenant will fail the same way.
      if (isMissingSchema(stateError)) return o;
      continue;
    }
    if (!state || typeof state !== 'object') continue;

    const due = decideNotices(state as Record<string, any>);
    if (due.length === 0) continue;

    const recipients = await adminRecipients(tenant.id);
    for (const notice of due) {
      for (const to of recipients) {
        const result = await sendOnce({
          tenantId: tenant.id,
          kind: notice.kind,
          periodKey: `${notice.periodKey}:${to}`,
          to,
          template: notice.template,
          vars: { ...notice.vars, firmName: tenant.name ?? null },
          metadata: { block_reason: (state as any).block_reason ?? null },
        });
        record(o, `${tenant.id}/${notice.kind}/${to}`, result);
      }
    }
  }

  return o;
}

interface DueNotice {
  kind: string;
  periodKey: string;
  template: TemplateKey;
  vars: Record<string, any>;
}

/**
 * Which trial/usage notices a firm is due, from the usage state alone.
 *
 * Pure, and exported so scripts/check-email.ts can drive it with states rather
 * than with a database. The asymmetry it encodes is the one the review says is
 * nowhere written down (docs/EMAIL-SPEC-REVIEW.md 4.2): a TRIAL hard-stops at
 * its allowance, a PAID plan never stops and rolls into overage. Both sides
 * come from the same resolver, so the wording cannot contradict the gate.
 */
export function decideNotices(state: Record<string, any>): DueNotice[] {
  const due: DueNotice[] = [];

  // A comped firm (a pilot) is never nagged about allowances it is not paying
  // for. tenant_usage_state resolves comp first, so this mirrors the gate.
  if (state.is_comped === true) return due;

  const status = String(state.subscription_status ?? '');
  const used = Number(state.checks_used_this_period ?? 0);
  const allowance = state.plan_check_allowance == null ? null : Number(state.plan_check_allowance);
  const periodStart = String(state.billing_period_start ?? '').slice(0, 10);
  const periodEnd = state.billing_period_end ?? null;

  if (status === 'active') {
    if (allowance == null || allowance <= 0) return due;
    const vars = {
      checksUsed: used,
      allowance,
      checksRemaining: Math.max(0, allowance - used),
      overageChecks: Math.max(0, used - allowance),
      periodEnd,
      planLabel: planLabel(state.plan),
    };

    if (used >= allowance) {
      due.push({
        kind: 'usage_allowance_reached',
        periodKey: periodStart,
        template: 'usage_allowance_reached',
        vars,
      });
      if (used > allowance) {
        due.push({ kind: 'overage_summary', periodKey: periodStart, template: 'overage_summary', vars });
      }
    } else if (used >= allowance * NEARLY) {
      due.push({ kind: 'usage_warning', periodKey: periodStart, template: 'usage_warning', vars });
    } else if (used >= allowance * HALF) {
      due.push({ kind: 'usage_half', periodKey: periodStart, template: 'usage_half', vars });
    }
    return due;
  }

  if (status === 'past_due' || status === 'canceled' || status === 'expired') {
    // Stripe sends the failed-payment, receipt, refund and cancellation
    // notices itself, configured with Kyriq branding (CHECKLIST section 9).
    // Rebuilding them here would mail a firm twice for one event.
    return due;
  }

  // ── Trialing ──────────────────────────────────────────────────────────
  const limit = Number(state.trial_check_limit ?? 250);
  const trialUsed = Number(state.trial_checks_used ?? 0);
  const trialEndsAt = state.trial_ends_at ?? null;
  const daysRemaining = Number(state.days_remaining ?? 0);
  // Stable for the whole trial, so the thresholds are once-per-trial.
  const trialKey = String(trialEndsAt ?? state.trial_started_at ?? 'trial').slice(0, 10);

  const vars = {
    checksUsed: trialUsed,
    checkLimit: limit,
    checksRemaining: Math.max(0, limit - trialUsed),
    daysRemaining,
    trialEndsAt,
    trialDays: 14,
    trialCheckLimit: limit,
  };

  // Once per firm, ever: period_key is the tenant id, so an invited colleague
  // joining later cannot trigger a second "your trial is ready"
  // (docs/EMAIL-SPEC-REVIEW.md 4.5).
  if (state.tenant_id) {
    due.push({
      kind: 'trial_started',
      periodKey: String(state.tenant_id),
      template: 'trial_started',
      vars,
    });
  }

  const reason = String(state.block_reason ?? '');
  if (state.processing_allowed === false) {
    if (reason === 'trial_check_limit_reached') {
      due.push({
        kind: 'trial_checks_exhausted',
        periodKey: trialKey,
        template: 'trial_checks_exhausted',
        vars,
      });
    } else if (reason === 'trial_expired') {
      due.push({ kind: 'trial_expired', periodKey: trialKey, template: 'trial_expired', vars });
    }
    return due;
  }

  if (trialUsed >= limit * NEARLY) {
    due.push({
      kind: 'trial_checks_warning',
      periodKey: trialKey,
      template: 'trial_checks_warning',
      vars,
    });
  } else if (trialUsed >= limit * HALF) {
    due.push({ kind: 'trial_halfway', periodKey: trialKey, template: 'trial_halfway', vars });
  }

  if (trialEndsAt && daysRemaining > 0 && daysRemaining <= ENDING_SOON_DAYS) {
    due.push({
      kind: 'trial_ending_soon',
      periodKey: trialKey,
      template: 'trial_ending_soon',
      vars,
    });
  }

  return due;
}

async function firmName(svc: any, tenantId: string): Promise<string | null> {
  const { data } = await svc.from('tenants').select('name').eq('id', tenantId).maybeSingle();
  return data?.name ?? null;
}
