'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Field,
  GlassCard,
  GlassCardEyebrow,
  GlassCardTitle,
  Input,
  KpiTile,
  Skeleton,
  Table,
  TableEmpty,
  TableScroll,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';

interface Firm {
  id: string;
  firm: string;
  slug: string | null;
  created_at: string | null;
  users: number;
  administrators: number;
  admins_without_mfa: number;
  require_mfa_all_users: boolean;
  plan: string | null;
  billing_frequency: string | null;
  trial_status: string | null;
  trial_ends_at: string | null;
  trial_usage: number | null;
  trial_limit: number | null;
  days_remaining: number | null;
  subscription_status: string | null;
  monthly_usage: number | null;
  included_usage: number | null;
  overage_units: number | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  processing_allowed: boolean | null;
  block_reason: string | null;
  payment_status: string | null;
  paid_through: string | null;
  cancellation_status: string | null;
  cancel_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  comp_account: {
    active: boolean;
    reason: string | null;
    expires_at: string | null;
    granted_by_email: string | null;
    check_limit: number | null;
    checks_used: number | null;
  } | null;
  stripe: { customer: string | null; subscription: string | null };
}

interface CompGrant {
  id: string;
  tenant_id: string;
  reason: string;
  expires_at: string;
  check_limit: number | null;
  granted_by_email: string | null;
}

interface Sources {
  trial: string | null;
  usage: string | null;
  subscription: string | null;
  comp: string | null;
  missing: string[];
}

const dash = (v: unknown) =>
  v === null || v === undefined || v === '' ? <span className="text-ink-faint">&mdash;</span> : String(v);

const date = (v: string | null) =>
  v ? new Date(v).toLocaleDateString() : <span className="text-ink-faint">&mdash;</span>;

function tone(status: string | null) {
  const s = (status || '').toLowerCase();
  if (['active', 'paid', 'succeeded', 'current'].includes(s)) return 'success' as const;
  if (['trialing', 'trial', 'pending', 'past_due', 'incomplete'].includes(s)) return 'warning' as const;
  if (['canceled', 'cancelled', 'unpaid', 'failed', 'expired'].includes(s)) return 'error' as const;
  return 'neutral' as const;
}

export default function AdminFirmsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [sources, setSources] = useState<Sources | null>(null);
  const [stripeMode, setStripeMode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Live comp grants, keyed by tenant. The grant/revoke endpoint
  // (/api/admin/comp-accounts) belongs to the billing parcel — this view only
  // reads it and drives it, so there is one place that writes comp_grants.
  const [grants, setGrants] = useState<Record<string, CompGrant>>({});
  const [compFor, setCompFor] = useState<Firm | null>(null);
  const [compReason, setCompReason] = useState('');
  const [compDays, setCompDays] = useState('30');
  const [compLimit, setCompLimit] = useState('');
  const [compBusy, setCompBusy] = useState(false);
  const [compError, setCompError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [res, grantRes] = await Promise.all([
        fetch('/api/admin/firms'),
        fetch('/api/admin/comp-accounts'),
      ]);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body?.firms)) {
        throw new Error(body?.message || `Could not load firms (${res.status})`);
      }
      setFirms(body.firms);
      setSources(body.sources || null);
      setStripeMode(body.stripe_mode || '');

      const grantBody = await grantRes.json().catch(() => ({}));
      const next: Record<string, CompGrant> = {};
      if (grantRes.ok && Array.isArray(grantBody?.grants)) {
        for (const g of grantBody.grants as CompGrant[]) {
          if (!next[g.tenant_id]) next[g.tenant_id] = g;
        }
      }
      setGrants(next);
    } catch (err: any) {
      setError(err?.message || 'Could not load firms');
    } finally {
      setLoading(false);
    }
  };

  const grantComp = async () => {
    if (!compFor) return;
    setCompBusy(true);
    setCompError('');
    try {
      const res = await fetch('/api/admin/comp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: compFor.id,
          reason: compReason,
          days: Number(compDays),
          ...(compLimit.trim() ? { checkLimit: Number(compLimit) } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.granted !== true) {
        throw new Error(body?.message || body?.error || 'Could not grant a comp account.');
      }
      setCompFor(null);
      setCompReason('');
      setCompLimit('');
      await load();
    } catch (err: any) {
      setCompError(err?.message || 'Could not grant a comp account.');
    } finally {
      setCompBusy(false);
    }
  };

  const revokeComp = async (firm: Firm) => {
    const grant = grants[firm.id];
    if (!grant) return;
    const reason = window.prompt(`Why is ${firm.firm}'s comp account being revoked?`);
    if (!reason) return;
    try {
      const res = await fetch('/api/admin/comp-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: grant.id, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'Revoke failed');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Revoke failed');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return firms;
    return firms.filter(
      (f) =>
        f.firm.toLowerCase().includes(q) ||
        (f.slug || '').toLowerCase().includes(q) ||
        (f.stripe_customer_id || '').toLowerCase().includes(q)
    );
  }, [firms, query]);

  const totals = useMemo(
    () => ({
      firms: firms.length,
      onTrial: firms.filter((f) => (f.trial_status || '').toLowerCase().startsWith('trial')).length,
      comped: firms.filter((f) => f.comp_account?.active).length,
      adminsWithoutMfa: firms.reduce((s, f) => s + (f.admins_without_mfa || 0), 0),
      overage: firms.reduce((s, f) => s + (f.overage_units || 0), 0),
    }),
    [firms]
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <GlassCardEyebrow>Super Admin</GlassCardEyebrow>
          <h1 className="font-heading text-2xl font-bold text-ink-strong">Firms &amp; billing</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search firm or Stripe id"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {sources && sources.missing.length > 0 && (
        <GlassCard padding="md" className="border-warning/40">
          <div className="flex items-start gap-3">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warning-text" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-ink-strong">
                No source in the schema yet: {sources.missing.join(', ')}
              </p>
              <p className="text-ink-body">
                Those columns read blank. Trial, usage and comp data come from migrations
                026&ndash;029 (<code className="text-xs">tenant_usage_state()</code>,{' '}
                <code className="text-xs">comp_grants</code>). The Stripe fields &mdash; billing
                frequency, payment status, paid-through date, cancellation and the Stripe ids
                &mdash; have no column anywhere yet. Fill in{' '}
                <code className="text-xs">STRIPE_FIELDS</code> in{' '}
                <code className="text-xs">lib/admin/billing-data.ts</code> when the Stripe parcel
                adds them; that is the only place to change.
              </p>
              <p className="text-ink-faint text-xs">
                Resolved: trial={sources.trial || 'none'} &middot; usage={sources.usage || 'none'} &middot;{' '}
                subscription={sources.subscription || 'none'} &middot; comp={sources.comp || 'none'}
                {stripeMode ? ` · Stripe ${stripeMode} mode` : ''}
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {error && (
        <GlassCard padding="md">
          <GlassCardTitle>Could not load firms</GlassCardTitle>
          <p className="mt-2 text-sm text-error-text">{error}</p>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Firms" value={totals.firms} loading={loading} />
        <KpiTile label="On trial" value={totals.onTrial} loading={loading} />
        <KpiTile label="Comp accounts" value={totals.comped} loading={loading} />
        <KpiTile label="Overage units" value={totals.overage} loading={loading} />
        <KpiTile
          label="Admins without MFA"
          value={totals.adminsWithoutMfa}
          caption="MFA is required for Administrators"
          loading={loading}
        />
      </div>

      <TableShell>
        <TableScroll className="max-h-[calc(100vh-24rem)]">
          <Table>
            <Thead>
              <Tr>
                <Th>Firm</Th>
                <Th>Plan</Th>
                <Th>Frequency</Th>
                <Th>Trial</Th>
                <Th numeric>Trial usage</Th>
                <Th>Subscription</Th>
                <Th numeric>Monthly usage</Th>
                <Th numeric>Overage</Th>
                <Th>Gate</Th>
                <Th>Payment</Th>
                <Th>Paid through</Th>
                <Th>Cancellation</Th>
                <Th>Comp</Th>
                <Th>Stripe</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <Tr key={`s${i}`}>
                    <Td colSpan={14}>
                      <Skeleton className="h-5 w-full" />
                    </Td>
                  </Tr>
                ))}

              {!loading &&
                filtered.map((f) => (
                  <Tr key={f.id}>
                    <Td>
                      <div className="font-medium text-ink-strong">{f.firm}</div>
                      <div className="text-xs text-ink-faint">
                        {f.users} user{f.users === 1 ? '' : 's'} &middot; {f.administrators} admin
                        {f.admins_without_mfa > 0 && (
                          <>
                            {' '}
                            &middot;{' '}
                            <span className="text-error-text">
                              {f.admins_without_mfa} without MFA
                            </span>
                          </>
                        )}
                      </div>
                    </Td>
                    <Td>{dash(f.plan)}</Td>
                    <Td>{dash(f.billing_frequency)}</Td>
                    <Td>
                      {f.trial_status ? (
                        <Badge tone={tone(f.trial_status)} size="sm">
                          {f.trial_status}
                        </Badge>
                      ) : (
                        dash(null)
                      )}
                      {f.trial_ends_at && (
                        <div className="text-xs text-ink-faint">
                          ends {date(f.trial_ends_at)}
                          {f.days_remaining !== null ? ` · ${f.days_remaining}d left` : ''}
                        </div>
                      )}
                    </Td>
                    <Td numeric>
                      {f.trial_usage === null
                        ? dash(null)
                        : `${f.trial_usage}${f.trial_limit !== null ? ` / ${f.trial_limit}` : ''}`}
                    </Td>
                    <Td>
                      {f.subscription_status ? (
                        <Badge tone={tone(f.subscription_status)} size="sm">
                          {f.subscription_status}
                        </Badge>
                      ) : (
                        dash(null)
                      )}
                    </Td>
                    <Td numeric>
                      {f.monthly_usage === null
                        ? dash(null)
                        : `${f.monthly_usage}${f.included_usage !== null ? ` / ${f.included_usage}` : ''}`}
                    </Td>
                    <Td numeric>{f.overage_units === null ? dash(null) : f.overage_units}</Td>
                    <Td>
                      {f.processing_allowed === null ? (
                        dash(null)
                      ) : f.processing_allowed ? (
                        <Badge tone="success" size="sm">allowed</Badge>
                      ) : (
                        <>
                          <Badge tone="error" size="sm">blocked</Badge>
                          {f.block_reason && (
                            <div className="text-xs text-ink-faint">{f.block_reason}</div>
                          )}
                        </>
                      )}
                    </Td>
                    <Td>
                      {f.payment_status ? (
                        <Badge tone={tone(f.payment_status)} size="sm">
                          {f.payment_status}
                        </Badge>
                      ) : (
                        dash(null)
                      )}
                    </Td>
                    <Td>{date(f.paid_through)}</Td>
                    <Td>
                      {f.cancellation_status ? (
                        <>
                          <Badge tone={tone(f.cancellation_status)} size="sm">
                            {f.cancellation_status}
                          </Badge>
                          {f.cancel_at && (
                            <div className="text-xs text-ink-faint">{date(f.cancel_at)}</div>
                          )}
                        </>
                      ) : (
                        dash(null)
                      )}
                    </Td>
                    <Td>
                      {f.comp_account ? (
                        <>
                          <Badge tone={f.comp_account.active ? 'success' : 'neutral'} size="sm">
                            {f.comp_account.active ? 'Comped' : 'Ended'}
                          </Badge>
                          {f.comp_account.reason && (
                            <div
                              className="max-w-[12rem] truncate text-xs text-ink-faint"
                              title={f.comp_account.reason}
                            >
                              {f.comp_account.reason}
                            </div>
                          )}
                          {f.comp_account.expires_at && (
                            <div className="text-xs text-ink-faint">
                              until {date(f.comp_account.expires_at)}
                            </div>
                          )}
                          {f.comp_account.granted_by_email && (
                            <div className="text-xs text-ink-faint">
                              by {f.comp_account.granted_by_email}
                            </div>
                          )}
                          {f.comp_account.check_limit !== null && (
                            <div className="text-xs text-ink-faint">
                              {f.comp_account.checks_used ?? 0} / {f.comp_account.check_limit} cheques
                            </div>
                          )}
                          {grants[f.id] && (
                            <button
                              type="button"
                              onClick={() => revokeComp(f)}
                              className="mt-1 text-xs text-error-text underline-offset-2 hover:underline"
                            >
                              Revoke
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCompFor(f);
                            setCompError('');
                            setCompReason('');
                            setCompDays('30');
                            setCompLimit('');
                          }}
                          className="text-xs text-brand-deep underline-offset-2 hover:underline"
                        >
                          Grant comp
                        </button>
                      )}
                    </Td>
                    <Td>
                      <div className="space-y-0.5 text-xs">
                        {f.stripe.customer ? (
                          <a
                            href={f.stripe.customer}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-deep hover:underline"
                          >
                            Customer <ExternalLink size={11} />
                          </a>
                        ) : (
                          <div className="text-ink-faint">no customer</div>
                        )}
                        {f.stripe.subscription && (
                          <a
                            href={f.stripe.subscription}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand-deep hover:underline"
                          >
                            Subscription <ExternalLink size={11} />
                          </a>
                        )}
                        {f.stripe_customer_id && (
                          <div className="font-mono text-[10px] text-ink-faint">
                            {f.stripe_customer_id}
                          </div>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}

              {!loading && filtered.length === 0 && (
                <TableEmpty
                  colSpan={14}
                  title="No firms"
                  description={query ? 'Nothing matches that search.' : 'No tenants exist yet.'}
                />
              )}
            </Tbody>
          </Table>
        </TableScroll>
      </TableShell>

      <p className="text-xs text-ink-faint">
        Comp grants, revocations and every other override are written to <code>audit_logs</code> by
        a database trigger, so the log cannot be skipped by a caller. The comp-account table and its
        grant / revoke endpoint belong to the billing parcel
        (<code>/api/admin/comp-accounts</code>); this view reads and drives them rather than
        writing <code>comp_grants</code> itself.
      </p>

      <Dialog
        open={compFor !== null}
        onClose={() => setCompFor(null)}
        title={`Grant a comp account${compFor ? ` to ${compFor.firm}` : ''}`}
        description="Free access for a set period. The reason and the expiry are both required and both end up in the audit log."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCompFor(null)} disabled={compBusy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={grantComp}
              disabled={compBusy || compReason.trim().length < 3 || !(Number(compDays) > 0)}
            >
              {compBusy ? 'Granting…' : 'Grant comp account'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field
            label="Reason"
            htmlFor="comp-reason"
            hint="At least 3 characters. This is how a pilot firm's free access is justified later."
          >
            <Input
              id="comp-reason"
              value={compReason}
              onChange={(e) => setCompReason(e.target.value)}
              placeholder="Pilot firm — agreed with Michael"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Days" htmlFor="comp-days">
              <Input
                id="comp-days"
                value={compDays}
                onChange={(e) => setCompDays(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Cheque limit" htmlFor="comp-limit" hint="Blank = unlimited">
              <Input
                id="comp-limit"
                value={compLimit}
                onChange={(e) => setCompLimit(e.target.value)}
                inputMode="numeric"
                placeholder="unlimited"
              />
            </Field>
          </div>
          {compError && <p className="text-sm text-error-text">{compError}</p>}
        </div>
      </Dialog>
    </div>
  );
}
