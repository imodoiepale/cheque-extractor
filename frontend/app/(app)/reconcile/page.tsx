'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Upload as UploadIcon,
} from 'lucide-react';
import {
  Badge,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  Skeleton,
  buttonVariants,
} from '@/components/ui';
import { useQBConnections } from '@/hooks/useQBConnections';
import { cn } from '@/lib/utils';
import ReviewStep from '@/components/review/ReviewStep';
import StartBatchCard from '@/components/reconcile/StartBatchCard';
import {
  EMPTY_COUNTS,
  deriveBatchSteps,
  type BatchPayload,
  type BatchStepNumber,
} from '@/lib/batch-state';
import { advanceStep, loadBatch, loadResume, type ResumeState } from '@/lib/reconcile-client';
import Stepper from '@/components/reconcile/Stepper';
import MatchProgress from '@/components/reconcile/MatchProgress';
import ConnectQuickBooksCard from '@/components/reconcile/ConnectQuickBooksCard';
import ApprovePanel from '@/components/reconcile/ApprovePanel';

/**
 * /reconcile — the one route for a reconciliation run (CHECKLIST section 3).
 *
 * Upload → Match → Review → Approve, driven by the batch record. Two rules
 * this page exists to keep:
 *
 *  1. The step on screen is always a number the SERVER returned, either
 *     `batch.state.current_step` or `entered_step` from an accepted advance.
 *     Clicking a step calls POST /api/batches/[id]/advance and waits; it never
 *     renders a step the user merely clicked. A 409 keeps the user where they
 *     are and shows the reason on the step that refused.
 *
 *  2. A new firm lands here with nothing to resume. `batch: null` from
 *     /api/batches/resume is that first run — not an error — and it opens on
 *     step 1 with the Connect QuickBooks card above the upload box, so
 *     onboarding is the same four steps as every other day.
 *
 * Steps 3 and 4 are thin slots: `ReviewStep` owns the Review tabs and
 * `ApprovePanel` owns Approve & Clear, including the one finalize call.
 */

function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}

export default function ReconcilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Reconcile />
    </Suspense>
  );
}

function Reconcile() {
  const searchParams = useSearchParams();
  const requestedBatch = searchParams?.get('batch') || null;
  const { hasConnections, isLoading: qbLoading, refresh: refreshConnections } =
    useQBConnections();

  const [resume, setResume] = useState<ResumeState | null>(null);
  const [batch, setBatch] = useState<BatchPayload | null>(null);
  /** Only ever set from a server-derived value. See rule 1 above. */
  const [activeStep, setActiveStep] = useState<BatchStepNumber>(1);
  const [pendingStep, setPendingStep] = useState<BatchStepNumber | null>(null);
  const [locked, setLocked] = useState<{ step: BatchStepNumber; reason: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      // A deep link names its batch; otherwise ask what there is to resume.
      const state: ResumeState = requestedBatch
        ? await (async () => {
            const one = await loadBatch(requestedBatch);
            return one.kind === 'batch'
              ? ({ kind: 'batch', batch: one.batch, resume_url: `/reconcile?batch=${one.batch.id}` } as ResumeState)
              : (one as ResumeState);
          })()
        : await loadResume();
      if (!live) return;
      setResume(state);
      if (state.kind === 'batch') {
        setBatch(state.batch);
        setActiveStep(state.batch.state.current_step);
      }
    })();
    return () => {
      live = false;
    };
  }, [requestedBatch]);

  /** Every step change goes through the server. */
  const selectStep = useCallback(
    async (step: BatchStepNumber) => {
      if (!batch) return; // First run: step 1 is the only thing on screen.
      setPendingStep(step);
      setLocked(null);
      const result = await advanceStep(batch.id, step);
      setPendingStep(null);

      if (result.kind === 'ok') {
        setBatch(result.batch);
        setActiveStep(result.entered_step);
        return;
      }
      if (result.kind === 'step_locked') {
        // Surfaced, never swallowed: the refused step says why, and the user
        // stays on the step they were already on.
        setLocked({ step, reason: result.reason });
        if (result.batch) setBatch(result.batch);
        return;
      }
      setLocked({ step, reason: result.message });
    },
    [batch]
  );

  /**
   * Adopt a batch that StartBatchCard just opened.
   *
   * The step comes from `next.state.current_step` — the server's derived value —
   * not from 1. A re-opened existing run (the endpoint is idempotent, so a
   * double submit returns the run that was already open) can legitimately be
   * mid-flow, and sending the user back to Upload would be wrong.
   */
  const adoptBatch = useCallback((next: BatchPayload) => {
    setBatch(next);
    setActiveStep(next.state.current_step);
    setLocked(null);
  }, []);

  /**
   * 409 no_active_company. The Connect card is already driven by
   * `hasConnections`, so rather than force it visible we re-ask — the usual
   * cause is a company connected in another tab, and a stale `false` here would
   * tell the user to connect something they already have.
   */
  const revealConnectCard = useCallback(() => {
    void refreshConnections();
  }, [refreshConnections]);

  const onAdvanced = useCallback((next: BatchPayload) => {
    setBatch(next);
    setActiveStep(3);
    setLocked(null);
  }, []);

  if (!resume) return <Loading />;

  // Honest about the one failure that happens today: migration 032 has never
  // been applied, so there is no batches table to read. A fabricated
  // zero-count batch here would render "Step 1 of 4" over nothing.
  if (resume.kind === 'migration_not_applied' || resume.kind === 'error' || resume.kind === 'unauthenticated') {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Header />
        <GlassCard className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" aria-hidden />
          <div className="min-w-0">
            <GlassCardTitle className="text-sm">Reconciliation is unavailable</GlassCardTitle>
            <p className="mt-1 text-sm text-ink-body">{resume.message}</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  // First run. The steps come from the same derivation the server uses, with
  // empty counts — so steps 2-4 are locked and carry their real reasons rather
  // than an invented shape.
  const state = batch ? batch.state : deriveBatchSteps(EMPTY_COUNTS, 'open');

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Header />

      {/* The returning user sees this first. */}
      {batch ? (
        <ContinueCard batch={batch} activeStep={activeStep} />
      ) : (
        <div className="space-y-3">
          <GlassPanel radius="card" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-strong">
                Start your first reconciliation
              </p>
              <p className="mt-0.5 text-sm text-ink-body">
                Nothing is in progress. Open a run for the period you are reconciling and Kyriq
                takes you through the same four steps every time.
              </p>
            </div>
            <Badge tone="neutral" className="shrink-0">
              Step 1 of 4
            </Badge>
          </GlassPanel>
          {/* Without this the flow could be rendered but never begun: /resume
              returns batch: null for a new firm, and upload only attaches to a
              batch that already exists. */}
          <StartBatchCard onStarted={adoptBatch} onNeedsConnection={revealConnectCard} />
        </div>
      )}

      <Stepper
        steps={state.steps}
        activeStep={activeStep}
        pendingStep={pendingStep}
        lockedStep={locked?.step ?? null}
        lockedReason={locked?.reason ?? null}
        onSelect={selectStep}
      />

      {activeStep === 1 ? (
        <div className="space-y-4">
          {/* Inline, above the upload box, so a new user never leaves the
              flow to go to Settings. */}
          {!qbLoading && !hasConnections ? <ConnectQuickBooksCard /> : null}
          <UploadSlot batchId={batch?.id ?? null} />
        </div>
      ) : null}

      {activeStep === 2 && batch ? (
        <MatchProgress
          batch={batch}
          onBatch={setBatch}
          onAdvanced={onAdvanced}
          onBlocked={(reason) => setLocked({ step: 3, reason })}
        />
      ) : null}

      {activeStep === 3 ? <ReviewSlot /> : null}
      {activeStep === 4 ? <ApproveSlot batch={batch} onBatch={setBatch} /> : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold text-ink-strong">Reconcile</h1>
      <p className="mt-0.5 text-sm text-ink-body">
        Four steps, every period: upload the cheques, let Kyriq match them, review what needs a
        decision, then approve and clear.
      </p>
    </div>
  );
}

/**
 * Continue Reconciliation — Michael's card, rendered from `batch.summary`.
 * Every line is a server-derived string; nothing here is computed locally.
 */
function ContinueCard({
  batch,
  activeStep,
}: {
  batch: BatchPayload;
  activeStep: BatchStepNumber;
}) {
  const { summary } = batch;
  const complete = batch.status === 'complete';

  return (
    <GlassCard className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {complete ? 'Last reconciliation' : 'Continue reconciliation'}
        </p>
        <p className="mt-1 truncate text-base font-semibold text-ink-strong">{summary.heading}</p>
        <p className="mt-0.5 text-sm text-ink-body">
          {summary.period} · <span className="nums">{summary.step_label}</span>
          {summary.attention_label ? (
            <>
              {' — '}
              <span className="font-medium text-warning-text nums">{summary.attention_label}</span>
            </>
          ) : null}
        </p>
      </div>
      {complete ? (
        <Badge tone="success" className="shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Approved
        </Badge>
      ) : (
        <Link
          href={`/reconcile?batch=${batch.id}`}
          className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
        >
          {batch.state.current_step === activeStep ? 'You are on step ' : 'Resume at step '}
          <span className="nums">{batch.state.current_step}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </GlassCard>
  );
}

/** Step 1 slot. The uploader itself is the existing /upload surface. */
function UploadSlot({ batchId }: { batchId: string | null }) {
  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center gap-2">
        <UploadIcon className="h-4 w-4 text-brand-deep" aria-hidden />
        <GlassCardTitle className="text-sm">Upload this period&apos;s cheques</GlassCardTitle>
      </div>
      <p className="text-sm text-ink-body">
        Add the scanned cheque PDFs. Kyriq detects each cheque, extracts the fields, then moves
        straight on to matching — you will not be asked to choose an engine or a setting.
      </p>
      <Link
        href={batchId ? `/upload?batch=${batchId}` : '/upload'}
        className={cn(buttonVariants({ size: 'sm' }))}
      >
        <UploadIcon className="h-4 w-4" aria-hidden /> Add documents
      </Link>
    </GlassCard>
  );
}

/**
 * Step 3 slot. The Review merge has landed, so this mounts it rather than
 * linking out. `ReviewStep` owns the three tabs, the status chips and every one
 * of the 24 capabilities the old QB Match page carried; its Needs Attention tab
 * and this stepper's step-3 completion both read NEEDS_ATTENTION_STATUSES from
 * lib/batch-state.ts, so the tab and the step cannot disagree about whether the
 * user is finished.
 *
 * `heading` is omitted deliberately: the stepper already titles the step, and
 * passing one would render two headings.
 */
function ReviewSlot() {
  return <ReviewStep />;
}

/**
 * Step 4 slot. `ApprovePanel` owns the summary, the pre-flight checklist and the
 * one finalize call.
 *
 * Without a batch there is nothing to approve and nothing to describe — which is
 * only reachable by a deep link that failed to resolve, so it says that rather
 * than rendering an empty panel with a dead button.
 */
function ApproveSlot({
  batch,
  onBatch,
}: {
  batch: BatchPayload | null;
  onBatch: (next: BatchPayload) => void;
}) {
  if (!batch) {
    return (
      <GlassCard className="space-y-2">
        <GlassCardTitle className="text-sm">Approve and clear</GlassCardTitle>
        <p className="text-sm text-ink-body">
          No reconciliation is open, so there is nothing to approve. Start a run and come back when
          Review is finished.
        </p>
      </GlassCard>
    );
  }
  return <ApprovePanel batch={batch} onBatch={onBatch} />;
}
