'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  FileCheck2,
  Landmark,
  Lock,
} from 'lucide-react';
import { Badge, Button, GlassCard, GlassCardTitle, GlassPanel } from '@/components/ui';
import type { BatchPayload } from '@/lib/batch-state';
import { advanceStep } from '@/lib/reconcile-client';

/**
 * Step 4, Approve & Clear — the last step of the run.
 *
 * It does exactly one write, through the one endpoint that is allowed to do it:
 * POST /api/batches/[id]/advance with `{ step: 4, finalize: true }`. That
 * endpoint re-runs canEnterStep(4) and migration 032's trigger re-checks the
 * same condition inside the database, so nothing here is trusted — this panel
 * is a description of what the server is about to do, plus the button.
 *
 * Three things it refuses to do:
 *
 *  1. Grey out the button with no explanation. When the batch cannot be
 *     finalised the unmet preconditions are listed, each with the server's own
 *     reason string, from `batch.state.steps`.
 *  2. Fire twice. `inFlight` is a ref, so a second click during the request is
 *     dropped before it becomes a fetch. The endpoint is idempotent anyway
 *     (an already-complete batch answers 200 `already_complete`), so the worst
 *     case is a no-op the UI renders as success rather than as a failure.
 *  3. Claim it cleared QuickBooks. Finalising writes `status='complete'`,
 *     `approved_by` and a `batch.approved` audit row. It does NOT call
 *     QuickBooks — clearing a transaction there is the approve-and-clear path in
 *     the match APIs and the Chrome extension. The copy below says so instead of
 *     implying the money moved.
 */

export interface ApprovePanelProps {
  batch: BatchPayload;
  /** A fresh batch from the finalize call (or from a 409 that carried one). */
  onBatch: (batch: BatchPayload) => void;
}

export default function ApprovePanel({ batch, onBatch }: ApprovePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const inFlight = useRef(false);

  const c = batch.state.counts;
  const complete = batch.status === 'complete';
  const canApprove = batch.state.can_approve && !complete;
  /** Every precondition the server says is still unmet, earliest first. */
  const unmet = batch.state.steps.filter((s) => s.step < 4 && !s.complete);

  const approve = useCallback(async () => {
    if (inFlight.current) return; // Second click during the request: dropped.
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setBlocked(null);

    const result = await advanceStep(batch.id, 4, { finalize: true });

    inFlight.current = false;
    setBusy(false);

    if (result.kind === 'ok') {
      // Covers both the real approval and the idempotent `already_complete`
      // answer: either way the batch we were handed is the truth.
      onBatch(result.batch);
      return;
    }
    if (result.kind === 'step_locked') {
      // Same contract as the stepper: stay here, show the reason.
      setBlocked(result.reason);
      if (result.batch) onBatch(result.batch);
      return;
    }
    setError(result.message);
  }, [batch.id, onBatch]);

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <GlassCardTitle className="text-sm">Approve and clear</GlassCardTitle>
          <p className="mt-0.5 text-sm text-ink-body">
            {complete
              ? 'This reconciliation is approved. The batch is locked and the approval is in the audit log.'
              : canApprove
                ? 'Nothing is left to decide. Approving locks this batch and records who approved it.'
                : 'This batch cannot be approved yet — the steps below are not finished.'}
          </p>
        </div>
        <Badge tone={complete ? 'success' : canApprove ? 'brand' : 'warning'} className="shrink-0">
          {complete ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approved
            </>
          ) : canApprove ? (
            'Ready to approve'
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" aria-hidden /> Not ready
            </>
          )}
        </Badge>
      </div>

      {/* What is being approved. Every value is from the batch record. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact icon={<Building2 className="h-3.5 w-3.5" aria-hidden />} label="Company">
          {batch.company_name || batch.realm_id}
        </Fact>
        <Fact icon={<Landmark className="h-3.5 w-3.5" aria-hidden />} label="Account">
          {batch.account_name || (
            <span className="text-ink-faint">Whole company — no single account</span>
          )}
        </Fact>
        <Fact icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />} label="Period">
          {batch.summary.period}
        </Fact>
        <Fact icon={<FileCheck2 className="h-3.5 w-3.5" aria-hidden />} label="Cheques">
          <span className="nums">{c.checks_total}</span> from{' '}
          <span className="nums">{c.jobs_complete}</span> document
          {c.jobs_complete === 1 ? '' : 's'}
        </Fact>
      </div>

      {/* Pre-flight: what this click will and will not do. */}
      <GlassPanel radius="input" padding="sm" className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {complete ? 'What was recorded' : 'What approving does'}
        </p>
        <ul className="space-y-1.5 text-sm text-ink-body">
          <Line tone="ok">
            <span className="nums font-medium text-ink-strong">{c.matched + c.approved}</span> match
            {c.matched + c.approved === 1 ? '' : 'es'} {complete ? 'were' : 'will be'} approved for{' '}
            {batch.company_name || batch.realm_id}
            {batch.account_name ? ` · ${batch.account_name}` : ''}.
          </Line>
          <Line tone={c.rejected > 0 ? 'muted' : 'ok'}>
            <span className="nums font-medium text-ink-strong">{c.rejected}</span> excluded as
            rejected — left out of the approval and still visible in Review.
          </Line>
          <Line tone={c.needs_attention > 0 ? 'warn' : 'ok'}>
            <span className="nums font-medium text-ink-strong">{c.needs_attention}</span> unresolved
            {c.needs_attention > 0
              ? ' — these block approval until each one is settled in Review.'
              : ' — nothing is waiting on a decision.'}
          </Line>
          {/* Honest about the boundary. This endpoint does not touch QuickBooks. */}
          <Line tone="muted">
            Nothing is written to QuickBooks by this step. It records the approval and the audit
            entry; clearing a transaction in QuickBooks is done from the match screens or the Kyriq
            Chrome extension.
          </Line>
        </ul>
      </GlassPanel>

      {/* Blocked, with the reasons spelled out rather than a dead button. */}
      {unmet.length > 0 ? (
        <GlassPanel
          radius="input"
          padding="sm"
          className="space-y-1.5 border-warning-border bg-warning-bg/50"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-ink-strong">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" aria-hidden />
            Finish these first
          </p>
          <ul className="space-y-1 text-sm text-ink-body">
            {unmet.map((s) => (
              <li key={s.step}>
                <span className="font-medium text-ink-strong">
                  Step <span className="nums">{s.step}</span> · {s.label}
                </span>{' '}
                — {s.reason || 'Not complete.'}
              </li>
            ))}
          </ul>
        </GlassPanel>
      ) : null}

      {blocked ? (
        <GlassPanel
          role="alert"
          radius="input"
          padding="sm"
          className="border-warning-border bg-warning-bg/50 text-sm text-ink-body"
        >
          {blocked}
        </GlassPanel>
      ) : null}

      {error ? (
        <GlassPanel
          role="alert"
          radius="input"
          padding="sm"
          className="border-error-border bg-error-bg/50 text-sm text-ink-body"
        >
          {error}
        </GlassPanel>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {complete ? (
          <Badge tone="success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Approved
            {batch.approved_at ? ` ${new Date(batch.approved_at).toLocaleString()}` : ''}
          </Badge>
        ) : (
          <Button
            size="sm"
            onClick={approve}
            loading={busy}
            disabled={!canApprove}
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
          >
            {busy ? 'Approving…' : 'Approve this reconciliation'}
          </Button>
        )}
        {!complete && !canApprove ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <CircleSlash className="h-3.5 w-3.5" aria-hidden />
            Approval unlocks when Review is finished.
          </span>
        ) : null}
      </div>
    </GlassCard>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <GlassPanel radius="input" padding="sm" className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        <span className="text-brand-deep">{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-ink-strong" title={label}>
        {children}
      </p>
    </GlassPanel>
  );
}

function Line({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'muted';
  children: ReactNode;
}) {
  const mark =
    tone === 'warn' ? (
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text" aria-hidden />
    ) : tone === 'muted' ? (
      <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
    ) : (
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-text" aria-hidden />
    );
  return (
    <li className="flex gap-2">
      {mark}
      <span className="min-w-0">{children}</span>
    </li>
  );
}
