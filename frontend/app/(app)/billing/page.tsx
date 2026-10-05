'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt, FileText, CreditCard, Calendar, Zap, TrendingUp, AlertCircle, Clock,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Badge, GlassCard, GlassCardTitle, GlassPanel, KpiTile, Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Billing & usage.
 *
 * Two hard rules this page is held to, because it is the page a reader will
 * check numbers against:
 *
 *  1. Nothing on it is invented. Stripe is not built yet (CHECKLIST 7), so
 *     payment status, paid-through date, payment method, invoice documents and
 *     plan-change controls have NO data source — they are listed as pending
 *     rather than rendered with plausible-looking values. The per-month figures
 *     below are internal processing cost, which is real, and they are labelled
 *     as processing cost rather than dressed up as customer invoices.
 *  2. The trial meter reads `GET /api/usage/trial-status`, the same function
 *     the processing gate enforces, so the number shown and the number enforced
 *     cannot drift. Its migrations are not applied to any database yet, so a
 *     failure renders as "unavailable" with the reason — never as a zero.
 *
 * Blur budget: every glass surface here is a KpiTile or a GlassCard container.
 * The per-provider tiles, the plan cards and the month rows are GlassPanels or
 * plain rows, so the count does not scale with data.
 */

/** Row height for the month list. Declared once; unchanged from pre-redesign. */
const MONTH_ROW = 'px-5 py-3.5';

/**
 * Published plan figures, CHECKLIST section 7. These are catalogue prices, not
 * subscription state — nobody is on a plan until Stripe exists. Any drift
 * between these and the checklist table is what check-parcel-h.ts asserts.
 */
const PLANS = [
  { name: 'Essential',    monthly: 147, annual: 1617,  includedChecks: 1200,  overage: 0.15, popular: false },
  { name: 'Professional', monthly: 497, annual: 5467,  includedChecks: 4500,  overage: 0.12, popular: true },
  { name: 'Scale',        monthly: 997, annual: 10967, includedChecks: 10000, overage: 0.10, popular: false },
] as const;

/** Billing facts with no source yet. Shown as pending, never as a value. */
const PENDING_FIELDS = [
  'Payment status',
  'Paid-through date',
  'Payment method',
  'Invoice documents',
  'Change plan / cancel renewal / reactivate',
] as const;

interface Job {
  job_id: string;
  pdf_name: string;
  status: string;
  total_pages: number;
  total_checks: number;
  checks?: any[];
  created_at: string;
  completed_at?: string;
  total_api_cost_usd?: number;
  total_tokens?: number;
  api_usage_summary?: any;
}

interface ApiUsage {
  total_cost_usd: number;
  total_tokens: number;
  total_api_calls: number;
  is_estimate?: boolean;
  warning?: string;
  usage_by_provider: {
    [key: string]: {
      calls: number;
      total_tokens: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_cost_usd: number;
    };
  };
  jobs_with_usage: Job[];
}

interface MonthUsage {
  id: string;
  periodLabel: string;
  docs: number;
  pages: number;
  cheques: number;
  extracted: number;
  cost: number;
  isCurrent: boolean;
}

interface TrialStatus {
  plan: string | null;
  subscriptionStatus: string | null;
  daysRemaining: number | null;
  checksRemaining: number | null;
  checksUsedThisPeriod: number;
  trialCheckLimit: number | null;
  trialEndsAt: string | null;
  planCheckAllowance: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  processingAllowed: boolean;
  blockReason: string | null;
  isComped: boolean;
  compExpiresAt: string | null;
  compReason: string | null;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

const money = (n: number) => `$${n.toFixed(2)}`;
const whole = (n: number) => n.toLocaleString('en-US');

export default function BillingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/jobs`);
      const data = await res.json();
      setJobs((data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));

      const usageRes = await fetch(`${BACKEND}/api/billing/usage`);
      setApiUsage(await usageRes.json());
      setUsageError(null);
    } catch (e: any) {
      console.error('Failed to fetch billing data:', e);
      setUsageError(e?.message || 'Could not reach the processing service.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * The trial meter. Everything it shows comes from tenant_usage_state(), so a
   * failure here means we genuinely do not know the usage — and saying so is
   * the only correct render. Migration 029 is not applied anywhere yet, so this
   * failure path is the LIKELY path today, not an edge case.
   */
  const fetchTrial = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/usage/trial-status', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `trial-status returned ${res.status}`);
      }
      setTrial(body as TrialStatus);
      setTrialError(null);
    } catch (e: any) {
      setTrial(null);
      setTrialError(e?.message || 'Usage state unavailable.');
    } finally {
      setTrialLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); fetchTrial(); }, [fetchData, fetchTrial]);

  /** Processing cost grouped by calendar month. Real figures, no payment state. */
  const months = useMemo<MonthUsage[]>(() => {
    const byMonth: Record<string, Job[]> = {};
    jobs.forEach(j => {
      const d = new Date(j.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      (byMonth[key] ||= []).push(j);
    });

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return Object.entries(byMonth)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([period, monthJobs]): MonthUsage => {
        const [y, m] = period.split('-');
        return {
          id: period,
          periodLabel: new Date(parseInt(y), parseInt(m) - 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          docs: monthJobs.length,
          pages: monthJobs.reduce((s, j) => s + (j.total_pages || 0), 0),
          cheques: monthJobs.reduce((s, j) => s + (j.total_checks || 0), 0),
          extracted: monthJobs.reduce((s, j) =>
            s + (j.checks || []).filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length, 0),
          cost: monthJobs.reduce((s, j) => s + (j.total_api_cost_usd || 0), 0),
          isCurrent: period === currentKey,
        };
      });
  }, [jobs]);

  const currentMonth = months.find(m => m.isCurrent);
  const allTimeCost = months.reduce((s, m) => s + m.cost, 0);
  const totalExtracted = months.reduce((s, m) => s + m.extracted, 0);
  const totalPages = months.reduce((s, m) => s + m.pages, 0);

  /* Trial meter numbers, only ever derived when we actually have them. */
  const allowance = trial?.planCheckAllowance ?? trial?.trialCheckLimit ?? null;
  const usedPct =
    allowance && allowance > 0
      ? Math.min(100, Math.max(0, (trial!.checksUsedThisPeriod / allowance) * 100))
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5" data-tone="calm">
      {/* ── Header ──────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong">Billing &amp; usage</h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          Processing usage, trial allowance and plan reference
        </p>
      </div>

      {/* ── Trial / allowance meter ─────────────────── */}
      <GlassCard padding="md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <GlassCardTitle className="text-base">Plan &amp; allowance</GlassCardTitle>
          {trial?.isComped && <Badge tone="brand" size="sm">Complimentary access</Badge>}
          {trial && !trial.processingAllowed && (
            <Badge tone="error" size="sm">Processing blocked</Badge>
          )}
        </div>

        {trialLoading ? (
          <div className="mt-3 space-y-2">
            <Skeleton shape="heading" className="w-40" />
            <Skeleton shape="text" className="w-full" />
          </div>
        ) : trialError ? (
          /* No data is not zero data. Say which call failed and why. */
          <div className="mt-3 flex items-start gap-3 rounded-tile border border-warning-border bg-warning-bg px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
            <div className="text-sm text-warning-text">
              <p className="font-semibold">Usage state unavailable</p>
              <p className="mt-1 text-xs">
                <code className="rounded bg-warning-bg px-1">GET /api/usage/trial-status</code> failed:{' '}
                {trialError}
              </p>
              <p className="mt-1 text-xs">
                The usage-ledger migrations have not been applied to this database, so there is no
                allowance to report. No figure is shown rather than a zero that would read as
                &quot;nothing used&quot;.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <GlassPanel tone="plain" radius="tile" padding="sm">
                <p className="text-eyebrow text-ink-faint">Plan</p>
                <p className="mt-1 text-sm font-semibold capitalize text-ink-strong">
                  {trial?.plan || 'Trial'}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint capitalize">
                  {trial?.subscriptionStatus || 'no subscription'}
                </p>
              </GlassPanel>
              <GlassPanel tone="plain" radius="tile" padding="sm">
                <p className="text-eyebrow text-ink-faint">Days left</p>
                <p className="nums mt-1 text-sm font-semibold text-ink-strong">
                  {trial?.daysRemaining ?? '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {trial?.trialEndsAt
                    ? new Date(trial.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'not on a trial'}
                </p>
              </GlassPanel>
              <GlassPanel tone="plain" radius="tile" padding="sm">
                <p className="text-eyebrow text-ink-faint">Cheques used</p>
                <p className="nums mt-1 text-sm font-semibold text-ink-strong">
                  {whole(trial?.checksUsedThisPeriod ?? 0)}
                  {allowance ? <span className="text-ink-faint"> / {whole(allowance)}</span> : null}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">this period</p>
              </GlassPanel>
              <GlassPanel tone="plain" radius="tile" padding="sm">
                <p className="text-eyebrow text-ink-faint">Remaining</p>
                <p className="nums mt-1 text-sm font-semibold text-ink-strong">
                  {trial?.checksRemaining == null ? 'Unlimited' : whole(trial.checksRemaining)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {trial?.billingPeriodEnd
                    ? `resets ${new Date(trial.billingPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : 'no period set'}
                </p>
              </GlassPanel>
            </div>

            {/* The meter itself. Width is the one unavoidable inline value. */}
            {usedPct != null && (
              <div className="mt-3">
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface-sunken shadow-inner-track"
                  role="meter"
                  aria-label="Cheques used this period"
                  aria-valuenow={trial!.checksUsedThisPeriod}
                  aria-valuemin={0}
                  aria-valuemax={allowance!}
                >
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-settle ease-settle',
                      usedPct >= 100 ? 'bg-error' : usedPct >= 80 ? 'bg-warning' : 'bg-brand'
                    )}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>
            )}

            {trial?.blockReason && (
              <p role="alert" className="mt-3 rounded-tile border border-error-border bg-error-bg px-3 py-2 text-xs text-error-text">
                Processing is blocked: {trial.blockReason}
              </p>
            )}
            {trial?.isComped && trial.compReason && (
              <p className="mt-3 text-xs text-ink-faint">
                Complimentary access: {trial.compReason}
                {trial.compExpiresAt
                  ? ` · until ${new Date(trial.compExpiresAt).toLocaleDateString('en-US')}`
                  : ''}
              </p>
            )}
          </>
        )}
      </GlassCard>

      {/* ── Processing usage KPIs ───────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          tone="brand"
          label="This month"
          value={currentMonth ? money(currentMonth.cost) : '$0.00'}
          caption={currentMonth ? `${whole(currentMonth.extracted)} extractions` : 'No usage'}
          icon={<Zap size={16} />}
          loading={loading}
        />
        <KpiTile
          tone="brand"
          label="All time"
          value={money(allTimeCost)}
          caption={`${whole(months.length)} month${months.length !== 1 ? 's' : ''}`}
          icon={<TrendingUp size={16} />}
          loading={loading}
        />
        <KpiTile
          tone="success"
          label="Pages"
          value={whole(totalPages)}
          caption="processed"
          icon={<FileText size={16} />}
          loading={loading}
        />
        <KpiTile
          tone="success"
          label="Extractions"
          value={whole(totalExtracted)}
          caption="completed"
          icon={<Receipt size={16} />}
          loading={loading}
        />
      </div>

      {usageError && (
        <p role="alert" className="rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text">
          {usageError}
        </p>
      )}

      {/* ── Estimated-cost warning, kept verbatim in meaning ───────── */}
      {apiUsage?.is_estimate && (
        <GlassCard padding="md">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-ink-strong">Using estimated costs</h3>
              <p className="mt-1 text-xs text-ink-body">
                {apiUsage.warning ||
                  'Jobs extracted before cost tracking was enabled are showing estimated costs.'}
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                For actual figures, apply{' '}
                <code className="rounded bg-surface-sunken px-1">012_add_api_usage_tracking.sql</code>{' '}
                or re-extract the affected documents.
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Per-provider processing cost ─────────────── */}
      {apiUsage && apiUsage.total_cost_usd > 0 && (
        <GlassCard padding="md">
          <GlassCardTitle className="text-base">
            Processing cost {apiUsage.is_estimate ? '(estimated)' : '(actual)'}
          </GlassCardTitle>
          <p className="mt-0.5 text-xs text-ink-faint">
            What it costs Kyriq to run these extractions. Not a customer charge.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.entries(apiUsage.usage_by_provider).map(([provider, usage]) => (
              <GlassPanel key={provider} tone="plain" radius="tile" padding="sm">
                <div className="text-sm font-medium capitalize text-ink-body">{provider}</div>
                <div className="nums mt-1 font-heading text-xl font-semibold text-ink-strong">
                  {money(usage.total_cost_usd)}
                </div>
                <div className="nums text-[11px] text-ink-faint">
                  {whole(usage.calls)} calls · {whole(usage.total_tokens)} tokens
                </div>
              </GlassPanel>
            ))}
            <GlassPanel tone="neutral" radius="tile" padding="sm">
              <div className="text-sm font-medium text-ink-body">Total</div>
              <div className="nums mt-1 font-heading text-xl font-semibold text-ink-strong">
                {money(apiUsage.total_cost_usd)}
              </div>
              <div className="nums text-[11px] text-ink-faint">
                {whole(apiUsage.total_tokens)} tokens
              </div>
            </GlassPanel>
          </div>
        </GlassCard>
      )}

      {/* ── Processing usage by month ────────────────── */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-hairline px-5 py-3.5">
          <GlassCardTitle className="text-base">Processing usage by month</GlassCardTitle>
          <Badge tone="outline" size="sm">Not invoices</Badge>
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1].map(i => <Skeleton key={i} shape="text" className="w-full" />)}
          </div>
        ) : months.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Receipt className="mx-auto mb-3 h-9 w-9 text-ink-faint" aria-hidden />
            <p className="font-heading text-base font-semibold text-ink-strong">No usage yet</p>
            <p className="mt-1 text-sm text-ink-body">
              Months appear here once documents have been processed.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-glass-hairline">
            {months.map(m => (
              <li key={m.id} className={cn('flex items-center gap-3', MONTH_ROW)}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-surface-sunken">
                  <Calendar size={14} className="text-ink-faint" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-strong">{m.periodLabel}</div>
                  <div className="nums mt-0.5 text-[11px] text-ink-faint">
                    {whole(m.docs)} doc{m.docs !== 1 ? 's' : ''} · {whole(m.pages)} pages ·{' '}
                    {whole(m.extracted)} extractions
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="nums-money text-sm font-semibold text-ink-strong">{money(m.cost)}</div>
                  <div className="mt-0.5 text-[10px] text-ink-faint">
                    {m.isCurrent ? 'Current period' : 'Closed period'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {/* ── Plan reference ──────────────────────────── */}
      <GlassCard padding="md">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <GlassCardTitle className="text-base">Plans</GlassCardTitle>
            <p className="mt-0.5 text-xs text-ink-faint">
              Published pricing. Checkout is not connected yet, so nothing here can be purchased
              in-app.
            </p>
          </div>
          <Badge tone="warning" size="sm">Checkout not built</Badge>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLANS.map(plan => (
            <GlassPanel
              key={plan.name}
              tone={plan.popular ? 'neutral' : 'plain'}
              radius="tile"
              padding="md"
              className={cn(plan.popular && 'ring-1 ring-brand/40')}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-heading text-base font-semibold text-ink-strong">{plan.name}</p>
                {plan.popular && <Badge tone="brand" size="sm">Most popular</Badge>}
              </div>
              <p className="nums mt-2 font-heading text-2xl font-semibold text-ink-strong">
                ${whole(plan.monthly)}
                <span className="text-sm font-normal text-ink-faint"> / month</span>
              </p>
              <p className="nums mt-0.5 text-xs text-ink-faint">
                or ${whole(plan.annual)} / year
              </p>
              <dl className="mt-3 space-y-1 text-xs text-ink-body">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Included cheques</dt>
                  <dd className="nums font-medium">{whole(plan.includedChecks)} / month</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Overage</dt>
                  <dd className="nums font-medium">${plan.overage.toFixed(2)} each</dd>
                </div>
              </dl>
            </GlassPanel>
          ))}
        </div>
      </GlassCard>

      {/* ── What this page cannot yet show ──────────── */}
      <GlassCard padding="md">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <div className="min-w-0">
            <GlassCardTitle className="text-base">Not connected yet</GlassCardTitle>
            <p className="mt-1 text-xs text-ink-body">
              These fields have no data source until Stripe billing is built. They are listed
              rather than rendered, so nothing on this page can be read as a real payment record.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {PENDING_FIELDS.map(f => (
                <li key={f}>
                  <Badge tone="outline" size="sm">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    {f}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
