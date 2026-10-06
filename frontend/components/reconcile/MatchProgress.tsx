'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button, GlassCard, GlassPanel, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BatchPayload } from '@/lib/batch-state';
import { advanceStep, loadBatch } from '@/lib/reconcile-client';

/**
 * Step 2, Match — a progress screen that moves on by itself.
 *
 * CHECKLIST section 3: "Match auto-advances. The user does nothing there, so
 * it is a progress screen that moves on by itself when matching finishes."
 * There is deliberately no Continue button in the happy path.
 *
 * It polls GET /api/batches/[id] (the same derived counts the stepper reads),
 * and when the server says step 2 is complete it POSTs advance → step 3 and
 * hands the fresh batch back. It never moves itself: if that POST comes back
 * 409 the reason is shown and the screen stays put.
 *
 * Matching that never finishes is a real state, not a spinner forever: when
 * the counts stop moving for STALL_MS the screen says so and offers the manual
 * matching page, because nothing on this page can run the matcher.
 */

const POLL_MS = 4000;
/** No progress for this long and matching is stuck, not slow. */
const STALL_MS = 90_000;

export interface MatchProgressProps {
  batch: BatchPayload;
  /** Fresh batch from a poll. */
  onBatch: (batch: BatchPayload) => void;
  /** The server accepted step 3. */
  onAdvanced: (batch: BatchPayload) => void;
  /** A 409 on the auto-advance. */
  onBlocked: (reason: string) => void;
}

export default function MatchProgress({
  batch,
  onBatch,
  onAdvanced,
  onBlocked,
}: MatchProgressProps) {
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const counts = batch.state.counts;
  const total = counts.checks_total;
  const done = Math.min(counts.matches_total, total || counts.matches_total);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  // Progress is "matches written", so a stall is that number not moving.
  const lastProgress = useRef({ value: -1, at: Date.now() });
  const advancing = useRef(false);

  const tick = useCallback(async () => {
    const result = await loadBatch(batch.id);
    if (result.kind !== 'batch') {
      setError(result.message);
      return;
    }
    const next = result.batch;
    onBatch(next);

    const progressed = next.state.counts.matches_total;
    if (progressed !== lastProgress.current.value) {
      lastProgress.current = { value: progressed, at: Date.now() };
      setStalled(false);
    } else if (Date.now() - lastProgress.current.at > STALL_MS) {
      setStalled(true);
    }

    const matchStep = next.state.steps.find((s) => s.step === 2);
    if (matchStep?.complete && !advancing.current) {
      advancing.current = true;
      // Never render step 3 off our own reading of `complete`: ask the server.
      const moved = await advanceStep(next.id, 3);
      advancing.current = false;
      if (moved.kind === 'ok') onAdvanced(moved.batch);
      else if (moved.kind === 'step_locked') onBlocked(moved.reason);
      else setError(moved.message);
    }
  }, [batch.id, onBatch, onAdvanced, onBlocked]);

  useEffect(() => {
    let live = true;
    const run = () => {
      if (live) void tick();
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
    // `attempt` restarts polling after a stall retry.
  }, [tick, attempt]);

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
            {stalled ? null : <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden />}
            Matching against QuickBooks
          </h2>
          <p className="mt-0.5 text-sm text-ink-body">
            Nothing to do here — this moves on by itself when matching finishes.
          </p>
        </div>
        <p className="nums shrink-0 font-heading text-2xl font-semibold text-ink-strong">
          {pct}%
        </p>
      </div>

      {/* Width is the only inline style: a percentage cannot be a token. */}
      <div
        className="relative h-3 w-full overflow-hidden rounded-pill bg-surface-sunken shadow-inner-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Cheques matched"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-pill bg-gradient-to-r from-brand-light via-brand to-brand-deep transition-[width] duration-700 ease-settle"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-ink-faint">
        <span className="nums">{done}</span> of <span className="nums">{total}</span> cheques
        matched
      </p>

      {stalled ? (
        <GlassPanel
          radius="input"
          padding="sm"
          className="flex flex-col gap-3 border-warning-border bg-warning-bg/50 sm:flex-row sm:items-center"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ink-body">
            Matching has not progressed for a while. It may have stopped — Kyriq cannot start it
            from this screen.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              Check again
            </Button>
            {/* Button has no asChild, so the anchor takes the recipe itself. */}
            <Link href="/qb-match" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
              Open matching
            </Link>
          </div>
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
    </GlassCard>
  );
}
