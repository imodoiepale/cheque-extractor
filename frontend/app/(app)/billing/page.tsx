'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Receipt, FileText, CreditCard, Calendar, Zap, TrendingUp, AlertCircle, Clock, ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Badge, Button, GlassCard, GlassCardTitle, GlassPanel, KpiTile, Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Billing & usage.
 *
 * Two hard rules this page is held to, because it is the page a reader will
 * check numbers against:
 *
 *  1. Nothing on it is invented. The Stripe parcel now supplies payment status,
 *     paid-through date, payment method, invoice history and the plan controls
 *     through GET /api/billing/subscription — and that endpoint returns only
 *     rows the signature-verified webhook wrote. When Stripe is not configured,
 *     or no webhook has ever arrived, those fields have NO source and are
 *     listed as pending (PENDING_FIELDS) exactly as before, rather than
 *     rendered with plausible-looking values. Invoice rows come from
 *     billing_invoices; a month with no invoice row produces no entry, and no
 *     status label is derived from a date. The per-month figures further down
 *     are internal processing cost, which is real, and they are labelled as
 *     processing cost rather than dressed up as customer invoices.
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
  { name: 'Starter',      monthly: 249,  annual: 2739,  includedChecks: 1200,  overage: 0.20, popular: false },
  { name: 'Professional', monthly: 649,  annual: 7139,  includedChecks: 4500,  overage: 0.20, popular: true },
  { name: 'Firm',         monthly: 1299, annual: 14289, includedChecks: 10000, overage: 0.20, popular: false },
] as const;

/** Display name -> Stripe plan key (keys are what lib/billing/plans.ts and the API use). */
const PLAN_KEY: Record<(typeof PLANS)[number]['name'], 'essential' | 'professional' | 'scale'> = {
  Starter: 'essential',
  Professional: 'professional',
  Firm: 'scale',
};

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

interface InvoiceRow {
  id: string;
  number: string | null;
  status: string;
  /** Mapped server-side. The page never turns a status into a word itself. */
  statusLabel: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  periodStart: string | null;
  periodEnd: string | null;
  settledAt: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

interface SubscriptionState {
  schemaPresent: boolean;
  /** The catalogue, served from lib/billing/plans.ts so the control list and
   *  the prices charged cannot disagree about which plans exist. */
  plans: Array<{
    key: string;
    name: string;
    monthly: number;
    annual: number;
    includedChecks: number;
    overage: number;
  }>;
  stripe: { configured: boolean; env: string; annualEnabled: boolean; reason: string | null; missing: string[] };
  subscription: {
    plan: string | null;
    planName: string | null;
    billingFrequency: string | null;
    basePrice: number | null;
    commitment: string | null;
    renewalTerms: string | null;
    status: string | null;
    paymentStatus: string | null;
    paymentGraceUntil: string | null;
    paidThrough: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    cancellationStatus: string | null;
    includedChecks: number | null;
    checksUsedThisPeriod: number | null;
    checksRemaining: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    overage: { units: number; rate: number | null; estimateUsd: number | null };
    stripeSubscriptionId: string | null;
  } | null;
  invoices: InvoiceRow[];
  paymentMethod: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  controls: {
    canChangePlan: boolean;
    canCancel: boolean;
    canReactivate: boolean;
    canSubscribeMonthly?: boolean;
    canSubscribeAnnual?: boolean;
  };
  message?: string;
}

/** The charges/credits disclosure a plan change must show before it is applied. */
interface PlanChangePreview {
  plan: string;
  planName: string;
  interval: string;
  chargesMinor: number;
  creditsMinor: number;
  dueNowMinor: number;
  effectiveAt: string;
  nextInvoiceAt: string | null;
  lines: Array<{ description: string | null; amountMinor: number }>;
  allowanceNote: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

const money = (n: number) => `$${n.toFixed(2)}`;
/** Stripe sends minor units. Converted here, never summed as floats upstream. */
const minor = (n: number) => `$${(n / 100).toFixed(2)}`;
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const whole = (n: number) => n.toLocaleString('en-US');

export default function BillingPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);

  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // The backend requires a session token once REQUIRE_AUTH is on.
      const { data: { session } } = await createClient().auth.getSession();
      const authHeaders = { Authorization: `Bearer ${session?.access_token || ''}` };
      const res = await fetch(`${BACKEND}/api/jobs`, { headers: authHeaders });
      const data = await res.json();
      setJobs((data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));

      const usageRes = await fetch(`${BACKEND}/api/billing/usage`, { headers: authHeaders });
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

  /** Bearer for the Next API routes, same transport as the trial meter. */
  const authHeaders = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    };
  }, []);

  /**
   * Subscription, invoices, payment method and which controls are legal.
   * A failure is reported, never softened into "no subscription" — those look
   * identical on screen and mean very different things to a customer.
   */
  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/subscription', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `subscription returned ${res.status}`);
      }
      setSub(body as SubscriptionState);
      setSubError(null);
    } catch (e: any) {
      setSub(null);
      setSubError(e?.message || 'Billing state unavailable.');
    } finally {
      setSubLoading(false);
    }
  }, [authHeaders]);

  const post = useCallback(async (path: string, body?: any) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body ?? {}),
    });
    const parsed = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parsed?.message || parsed?.error || `${path} returned ${res.status}`);
    return parsed;
  }, [authHeaders]);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setActionError(null);
    setActionNote(null);
    try {
      await fn();
    } catch (e: any) {
      setActionError(e?.message || 'That did not work.');
    } finally {
      setBusy(null);
    }
  }, []);

  /** Starts Checkout. Returning from Stripe grants nothing; the webhook does. */
  const startCheckout = (plan: string) =>
    run(`checkout:${plan}`, async () => {
      const { url } = await post('/api/billing/checkout', { plan, interval: 'monthly' });
      if (!url) throw new Error('Stripe did not return a checkout URL.');
      window.location.href = url;
    });

  const startAnnual = (plan: string) =>
    run(`annual:${plan}`, async () => {
      const { url } = await post('/api/billing/subscribe-annual', { plan });
      if (!url) throw new Error('Stripe did not return a setup URL.');
      window.location.href = url;
    });

  /** Disclosure first: charges, credits and the effective date, then Confirm. */
  const askPlanChange = (plan: string) =>
    run(`preview:${plan}`, async () => {
      const body = await post('/api/billing/plan-change', { plan, preview: true });
      setPreview(body?.preview ?? null);
    });

  const confirmPlanChange = () =>
    run('confirm-plan', async () => {
      if (!preview) return;
      await post('/api/billing/plan-change', {
        plan: preview.plan,
        interval: preview.interval,
        confirm: true,
        acknowledgedTotalMinor: preview.dueNowMinor,
      });
      setPreview(null);
      setActionNote('Plan change sent to Stripe. The plan updates here once Stripe confirms it.');
      await fetchSubscription();
    });

  const cancelRenewal = () =>
    run('cancel', async () => {
      const body = await post('/api/billing/cancel');
      setActionNote(body?.message || 'Renewal switched off.');
      await fetchSubscription();
    });

  const reactivate = () =>
    run('reactivate', async () => {
      const body = await post('/api/billing/reactivate');
      setActionNote(body?.message || 'Renewal switched back on.');
      await fetchSubscription();
    });

  useEffect(() => { fetchData(); fetchTrial(); fetchSubscription(); }, [fetchData, fetchTrial, fetchSubscription]);

  /**
   * Returning from Stripe. This banner says "confirming", because a redirect is
   * a URL the customer can type: paid access is applied by the verified webhook
   * and by nothing else. The page re-reads the real state instead of believing
   * the query string.
   */
  const [returnedFrom, setReturnedFrom] = useState<string | null>(null);
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('checkout');
    if (flag) setReturnedFrom(flag);
  }, []);

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

      {/* ── Back from Stripe. Says "confirming", never "active". ───── */}
      {returnedFrom === 'confirming' && (
        <GlassCard padding="md">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
            <div>
              <GlassCardTitle className="text-base">Confirming with Stripe</GlassCardTitle>
              <p className="mt-1 text-xs text-ink-body">
                Stripe has taken the details. Access changes only once Stripe&apos;s signed
                confirmation reaches us, which is usually seconds — returning to this page does not
                grant it. Reload if the plan below has not updated.
              </p>
            </div>
          </div>
        </GlassCard>
      )}
      {returnedFrom === 'cancelled' && (
        <p className="rounded-card border border-glass-hairline bg-surface-sunken px-4 py-3 text-sm text-ink-body">
          Checkout was closed before anything was charged. Nothing changed.
        </p>
      )}

      {/* ── Subscription: payment status, paid-through, method, controls ── */}
      {subLoading ? (
        <GlassCard padding="md">
          <Skeleton shape="heading" className="w-48" />
          <div className="mt-3 space-y-2">
            <Skeleton shape="text" className="w-full" />
          </div>
        </GlassCard>
      ) : subError ? (
        <GlassCard padding="md">
          <div className="flex items-start gap-3 rounded-tile border border-warning-border bg-warning-bg px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />
            <div className="text-sm text-warning-text">
              <p className="font-semibold">Billing state unavailable</p>
              <p className="mt-1 text-xs">
                <code className="rounded bg-warning-bg px-1">GET /api/billing/subscription</code>{' '}
                failed: {subError}
              </p>
              <p className="mt-1 text-xs">
                No payment figure is shown rather than a blank that would read as nothing owed.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : sub?.subscription?.stripeSubscriptionId ? (
        <GlassCard padding="md">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <GlassCardTitle className="text-base">Subscription</GlassCardTitle>
              <p className="mt-0.5 text-xs text-ink-faint">
                {sub.subscription.planName} ·{' '}
                {sub.subscription.billingFrequency === 'annual' ? 'billed annually' : 'billed monthly'}
                {sub.subscription.basePrice != null
                  ? ` · $${whole(sub.subscription.basePrice)} ${
                      sub.subscription.billingFrequency === 'annual' ? '/ year' : '/ month'
                    }`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="outline" size="sm">{sub.stripe.env} mode</Badge>
              {sub.subscription.status === 'past_due' && (
                <Badge tone="error" size="sm">Payment overdue</Badge>
              )}
              {sub.subscription.cancelAtPeriodEnd && (
                <Badge tone="warning" size="sm">Renewal off</Badge>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <GlassPanel tone="plain" radius="tile" padding="sm">
              <p className="text-eyebrow text-ink-faint">Payment status</p>
              <p className="mt-1 text-sm font-semibold capitalize text-ink-strong">
                {sub.subscription.paymentStatus || 'no invoice yet'}
              </p>
              <p className="mt-0.5 text-[11px] capitalize text-ink-faint">
                {sub.subscription.status || 'unknown'}
              </p>
            </GlassPanel>
            <GlassPanel tone="plain" radius="tile" padding="sm">
              <p className="text-eyebrow text-ink-faint">Paid through</p>
              <p className="nums mt-1 text-sm font-semibold text-ink-strong">
                {day(sub.subscription.paidThrough)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-faint">
                {sub.subscription.cancelAtPeriodEnd ? 'then it ends' : 'then it renews'}
              </p>
            </GlassPanel>
            <GlassPanel tone="plain" radius="tile" padding="sm">
              <p className="text-eyebrow text-ink-faint">Payment method</p>
              <p className="mt-1 text-sm font-semibold capitalize text-ink-strong">
                {sub.paymentMethod?.last4
                  ? `${sub.paymentMethod.brand || 'card'} ····${sub.paymentMethod.last4}`
                  : 'none on file'}
              </p>
              <p className="nums mt-0.5 text-[11px] text-ink-faint">
                {sub.paymentMethod?.expMonth
                  ? `expires ${String(sub.paymentMethod.expMonth).padStart(2, '0')}/${sub.paymentMethod.expYear}`
                  : 'held by Stripe'}
              </p>
            </GlassPanel>
            <GlassPanel tone="plain" radius="tile" padding="sm">
              <p className="text-eyebrow text-ink-faint">Overage this period</p>
              <p className="nums-money mt-1 text-sm font-semibold text-ink-strong">
                {sub.subscription.overage.estimateUsd != null
                  ? money(sub.subscription.overage.estimateUsd)
                  : '—'}
              </p>
              <p className="nums mt-0.5 text-[11px] text-ink-faint">
                {whole(sub.subscription.overage.units)} over ·{' '}
                {sub.subscription.overage.rate != null ? money(sub.subscription.overage.rate) : '—'} each
              </p>
            </GlassPanel>
          </div>

          {sub.subscription.renewalTerms && (
            <p className="mt-3 text-xs text-ink-faint">
              {sub.subscription.commitment} · {sub.subscription.renewalTerms}
              {sub.subscription.periodStart
                ? ` Current period ${day(sub.subscription.periodStart)} to ${day(sub.subscription.periodEnd)}.`
                : ''}
            </p>
          )}

          {/* Payment failure: a warning while Stripe retries. Processing is not
              restricted until Stripe gives up and moves the subscription to
              past_due, and history is never gated either way. */}
          {sub.subscription.paymentStatus === 'failed' && (
            <p
              role="alert"
              className="mt-3 rounded-tile border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text"
            >
              The last payment did not go through.{' '}
              {sub.subscription.paymentGraceUntil
                ? `Stripe retries on ${day(sub.subscription.paymentGraceUntil)}.`
                : 'Stripe is retrying.'}{' '}
              Update the card to avoid processing being restricted. Past documents stay available
              either way.
            </p>
          )}
          {sub.subscription.status === 'past_due' && (
            <p
              role="alert"
              className="mt-3 rounded-tile border border-error-border bg-error-bg px-3 py-2 text-xs text-error-text"
            >
              Processing is restricted while payment is outstanding. Everything already processed
              stays viewable and exportable.
            </p>
          )}

          {/* ── Controls. Only offered when the server would accept them. ── */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {sub.controls.canChangePlan &&
              sub.plans
                .filter(pl => pl.key !== sub.subscription?.plan)
                .map(pl => (
                  <Button
                    key={pl.key}
                    variant="secondary"
                    size="sm"
                    loading={busy === `preview:${pl.key}`}
                    onClick={() => askPlanChange(pl.key)}
                  >
                    Move to {pl.name}
                  </Button>
                ))}
            {sub.controls.canCancel && (
              <Button variant="ghost" size="sm" loading={busy === 'cancel'} onClick={cancelRenewal}>
                Cancel renewal
              </Button>
            )}
            {sub.controls.canReactivate && (
              <Button variant="primary" size="sm" loading={busy === 'reactivate'} onClick={reactivate}>
                Reactivate
              </Button>
            )}
          </div>

          {/* Charges, credits and the effective date, before anything applies. */}
          {preview && (
            <GlassPanel tone="neutral" radius="tile" padding="md" className="mt-3">
              <p className="font-heading text-sm font-semibold text-ink-strong">
                Moving to {preview.planName} ({preview.interval})
              </p>
              <dl className="mt-2 space-y-1 text-xs text-ink-body">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Charges</dt>
                  <dd className="nums-money font-medium">{minor(preview.chargesMinor)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Credits</dt>
                  <dd className="nums-money font-medium">{minor(preview.creditsMinor)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Due now</dt>
                  <dd className="nums-money font-semibold text-ink-strong">
                    {minor(preview.dueNowMinor)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-faint">Effective</dt>
                  <dd className="font-medium">{day(preview.effectiveAt)}</dd>
                </div>
                {preview.nextInvoiceAt && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-faint">Next invoice</dt>
                    <dd className="font-medium">{day(preview.nextInvoiceAt)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-ink-faint">{preview.allowanceNote}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" loading={busy === 'confirm-plan'} onClick={confirmPlanChange}>
                  Confirm and charge {minor(preview.dueNowMinor)}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  Keep current plan
                </Button>
              </div>
            </GlassPanel>
          )}

          {actionError && (
            <p
              role="alert"
              className="mt-3 rounded-tile border border-error-border bg-error-bg px-3 py-2 text-xs text-error-text"
            >
              {actionError}
            </p>
          )}
          {actionNote && (
            <p className="mt-3 rounded-tile border border-glass-hairline bg-surface-sunken px-3 py-2 text-xs text-ink-body">
              {actionNote}
            </p>
          )}
        </GlassCard>
      ) : null}

      {/* ── Invoice history: rows from billing_invoices, or nothing ─── */}
      {sub && sub.invoices.length > 0 && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-hairline px-5 py-3.5">
            <GlassCardTitle className="text-base">Invoices</GlassCardTitle>
            <Badge tone="outline" size="sm">From Stripe</Badge>
          </div>
          <ul className="divide-y divide-glass-hairline">
            {sub.invoices.map(inv => (
              <li key={inv.id} className={cn('flex items-center gap-3', MONTH_ROW)}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-surface-sunken">
                  <Receipt size={14} className="text-ink-faint" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-strong">{inv.number || inv.id}</div>
                  <div className="nums mt-0.5 text-[11px] text-ink-faint">
                    {day(inv.periodStart)} – {day(inv.periodEnd)} · {inv.statusLabel}
                  </div>
                </div>
                {inv.hostedUrl && (
                  <a
                    href={inv.hostedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-deep underline-offset-2 hover:underline"
                  >
                    View <ExternalLink size={12} aria-hidden />
                  </a>
                )}
                <div className="shrink-0 text-right">
                  <div className="nums-money text-sm font-semibold text-ink-strong">
                    {minor(inv.totalMinor)}
                  </div>
                  <div className="nums mt-0.5 text-[10px] text-ink-faint">
                    {inv.settledAt ? `settled ${day(inv.settledAt)}` : inv.currency.toUpperCase()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

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
              {sub?.subscription?.stripeSubscriptionId
                ? 'You are subscribed. Change plans from the Subscription card above.'
                : 'Pick a plan to continue after your trial. Payment is handled securely by Stripe; access starts once Stripe confirms it.'}
            </p>
          </div>
          {sub?.stripe?.configured === false ? (
            <Badge tone="warning" size="sm">Payments unavailable</Badge>
          ) : (
            <Badge tone="success" size="sm">Secure checkout by Stripe</Badge>
          )}
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
              {!sub?.subscription?.stripeSubscriptionId && sub?.stripe?.configured !== false && (
                <div className="mt-4 grid gap-2">
                  <Button
                    size="sm"
                    variant={plan.popular ? 'primary' : 'secondary'}
                    loading={busy === `checkout:${PLAN_KEY[plan.name]}`}
                    disabled={!!busy}
                    onClick={() => startCheckout(PLAN_KEY[plan.name])}
                  >
                    Subscribe monthly
                  </Button>
                  {sub?.stripe?.annualEnabled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `annual:${PLAN_KEY[plan.name]}`}
                      disabled={!!busy}
                      onClick={() => startAnnual(PLAN_KEY[plan.name])}
                    >
                      Pay annually (1 month free)
                    </Button>
                  )}
                </div>
              )}
            </GlassPanel>
          ))}
        </div>
        {!sub?.subscription?.stripeSubscriptionId && actionError && (
          <p role="alert" className="mt-3 rounded-tile border border-error-border bg-error-bg px-3 py-2 text-xs text-error-text">
            {actionError}
          </p>
        )}
      </GlassCard>

      {/* Still unsourced, and shown only while that is true. */}
      {!sub?.subscription?.stripeSubscriptionId && (
      <GlassCard padding="md">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <div className="min-w-0">
            <GlassCardTitle className="text-base">Not connected yet</GlassCardTitle>
            <p className="mt-1 text-xs text-ink-body">
              These fields come from Stripe, and no verified Stripe webhook has set them for this
              firm. They are listed rather than rendered, so nothing on this page can be read as a
              real payment record.
              {sub?.stripe && !sub.stripe.configured && sub.stripe.reason
                ? ` Stripe is not configured here: ${sub.stripe.reason}`
                : ''}
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
      )}
    </div>
  );
}
