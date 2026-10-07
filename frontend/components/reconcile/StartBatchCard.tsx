'use client';

import { useState } from 'react';
import { Play, Loader2, CalendarDays } from 'lucide-react';
import { Button, Field, GlassPanel, Input } from '@/components/ui';
import { createBatch, lastClosedMonth } from '@/lib/reconcile-client';
import type { BatchPayload } from '@/lib/batch-state';

/**
 * Opens a reconciliation run.
 *
 * This closes a real hole in section 3: /api/batches/resume answers
 * `batch: null` for a new firm, and upload only *attaches* to a batch that
 * already resolves — so nothing ever created one, and the first-run panel had
 * no way forward. The four steps could be rendered but never begun.
 *
 * The company is deliberately NOT a field here. The endpoint defaults it to
 * qb_connections.is_active server-side, so the run is opened against the same
 * company the matching routes and the extension read. Letting the browser pass
 * a realm would let this card and the backend disagree about which company is
 * being reconciled, which is the bug CHECKLIST section 4 calls out about
 * localStorage-only switching.
 */
export default function StartBatchCard({
  onStarted,
  onNeedsConnection,
}: {
  onStarted: (batch: BatchPayload) => void;
  /** Raised on 409 no_active_company, so step 1 can show the Connect card. */
  onNeedsConnection: () => void;
}) {
  const suggested = lastClosedMonth();
  const [periodStart, setPeriodStart] = useState(suggested.period_start);
  const [periodEnd, setPeriodEnd] = useState(suggested.period_end);
  const [accountName, setAccountName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked here only so the user is told before the round trip; the endpoint
  // validates it again, and that server check is the one that counts.
  const periodInvalid = !periodStart || !periodEnd || periodEnd < periodStart;

  async function start() {
    if (busy || periodInvalid) return;
    setBusy(true);
    setError(null);
    const result = await createBatch({
      period_start: periodStart,
      period_end: periodEnd,
      period_label: labelFor(periodStart, periodEnd),
      ...(accountName.trim() ? { account_name: accountName.trim() } : {}),
    });
    setBusy(false);

    switch (result.kind) {
      case 'ok':
        // `created: false` means an open run already existed for this scope —
        // the endpoint's unique index made the double submit idempotent. Either
        // way the user continues into that run rather than seeing an error.
        onStarted(result.batch);
        return;
      case 'no_active_company':
        onNeedsConnection();
        setError(result.message);
        return;
      default:
        setError(result.message);
    }
  }

  return (
    <GlassPanel radius="card" className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-brand-deep" aria-hidden />
        <p className="text-sm font-semibold text-ink-strong">Start a reconciliation</p>
      </div>
      <p className="text-sm text-ink-body">
        Kyriq suggests the month that just closed. Change it if you are catching up.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Period start" htmlFor="batch-period-start">
          <Input
            id="batch-period-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            state={periodInvalid ? 'invalid' : 'default'}
          />
        </Field>
        <Field label="Period end" htmlFor="batch-period-end">
          <Input
            id="batch-period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            state={periodInvalid ? 'invalid' : 'default'}
          />
        </Field>
        <Field
          label="Bank account"
          htmlFor="batch-account"
          hint="Optional — name it to keep runs apart"
        >
          <Input
            id="batch-account"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Operating Checking"
          />
        </Field>
      </div>

      {periodInvalid && (
        <p className="text-sm text-warning-text" role="status">
          The period must end on or after it starts.
        </p>
      )}
      {error && (
        <p className="text-sm text-error-text" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={start} disabled={busy || periodInvalid} loading={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {busy ? 'Opening…' : 'Start reconciliation'}
        </Button>
      </div>
    </GlassPanel>
  );
}

/** "August 2026" for a whole month; a plain range otherwise. */
function labelFor(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const monthEnd = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
  const whole = s.getUTCDate() === 1 && e.getTime() === monthEnd.getTime();
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  return whole
    ? fmt(s, { month: 'long', year: 'numeric' })
    : `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
