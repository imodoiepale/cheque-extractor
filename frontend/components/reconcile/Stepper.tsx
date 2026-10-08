'use client';

import { Check, Loader2, Lock } from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BatchStep, BatchStepNumber } from '@/lib/batch-state';

/**
 * The four steps: Upload → Match → Review → Approve.
 *
 * Michael, on the record: "I think the 1,2,3,4 description on the reconcile
 * page helps the individual know each step. Plus, they can click on each one
 * too." So every step is a real control — but a forward step that is not
 * `unlocked` is disabled and says WHY, instead of being a dead link. In the
 * v17 prototype these were plain anchors and Approve was reachable from Upload.
 *
 * This component renders `steps` exactly as the server derived them. It holds
 * no step state of its own and it does not decide what is reachable: it reports
 * the click, and `onSelect` POSTs to /api/batches/[id]/advance.
 */

const BLURBS: Record<string, string> = {
  upload: 'Add the cheque PDFs for this period.',
  match: 'Kyriq lines cheques up against QuickBooks.',
  review: 'Settle anything that needs a decision.',
  approve: 'Clear the matched cheques in QuickBooks.',
};

export interface StepperProps {
  steps: BatchStep[];
  /** The step on screen. Comes from the server, never from a click. */
  activeStep: BatchStepNumber;
  /** A step whose advance call is in flight. */
  pendingStep?: BatchStepNumber | null;
  /** Set from a 409: the step that was refused and the reason given. */
  lockedStep?: BatchStepNumber | null;
  lockedReason?: string | null;
  onSelect: (step: BatchStepNumber) => void;
}

export default function Stepper({
  steps,
  activeStep,
  pendingStep = null,
  lockedStep = null,
  lockedReason = null,
  onSelect,
}: StepperProps) {
  return (
    <GlassCard tier="chrome" padding="none" className="overflow-hidden">
      <ol className="flex flex-col divide-y divide-glass-hairline md:flex-row md:divide-x md:divide-y-0">
        {steps.map((s) => {
          const isActive = s.step === activeStep;
          const isPending = s.step === pendingStep;
          // Locked == the server will refuse it. It stays a button so it can
          // be focused and explain itself, but it cannot be activated.
          const locked = !s.unlocked && !s.complete;
          const refused = lockedStep === s.step && !!lockedReason;

          return (
            <li key={s.key} className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onSelect(s.step)}
                disabled={locked || isPending}
                aria-current={isActive ? 'step' : undefined}
                aria-disabled={locked || undefined}
                title={locked ? s.reason || undefined : undefined}
                className={cn(
                  'group flex w-full items-start gap-3 px-4 py-3.5 text-left',
                  'transition-[background-color,color] duration-tap ease-settle',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  locked
                    ? 'cursor-not-allowed opacity-disabled'
                    : 'hover:bg-brand/[0.045]',
                  isActive && 'bg-brand/[0.07]'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-pill',
                    'text-[13px] font-semibold nums',
                    s.complete
                      ? 'bg-success-bg text-success-text'
                      : isActive
                        ? 'bg-brand text-white'
                        : 'bg-ink-strong/[0.07] text-ink-faint'
                  )}
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : s.complete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    s.step
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        isActive ? 'text-ink-strong' : 'text-ink-body'
                      )}
                    >
                      {s.label}
                    </span>
                    {locked ? (
                      <Lock className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {BLURBS[s.key]}
                  </span>
                  {/* The reason a locked step is locked. A disabled control
                      with no explanation is the thing being fixed here. */}
                  {locked && s.reason ? (
                    <span className="mt-1 block text-xs text-ink-body">{s.reason}</span>
                  ) : null}
                  {refused ? (
                    <span role="status" className="mt-1 block text-xs font-medium text-warning-text">
                      {lockedReason}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
