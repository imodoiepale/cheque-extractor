/**
 * Step state for a reconciliation batch — derived, never stored.
 *
 * CHECKLIST section 3: "Step state comes from the batch record, not from which
 * page is open. Forward steps stay locked until the prior one is genuinely
 * complete." In the v17 prototype the four steps are plain links and Approve is
 * reachable from Upload. The fix is that nothing here reads a step number from
 * the client: every step's completion is a function of counts that only the
 * pipeline can move (cheques extracted, matches resolved, approvals written).
 *
 * This module is pure — no Supabase, no request — so the gating rule is
 * testable without a database. `scripts/check-batch-state.mjs` asserts it.
 *
 * ponytail: the step-3 rule is also expressed in SQL as
 * public.batch_can_complete() (migration 032), because the database has to
 * refuse a forward jump that never passes through this file. Two copies of one
 * rule is the known ceiling; they are three lines each and both are commented
 * to point at the other. Upgrade path: drop this copy and make every caller
 * round-trip to the RPC if the rule ever grows past a few conditions.
 */

/**
 * The match statuses that count as "needs attention", and the ONE place the set
 * is spelled out on the client.
 *
 * Three things have to agree about this set or the product lies to the user:
 *
 *   - public.batch_counts() in migration 032 (`status IN (...)`), which produces
 *     counts.needs_attention;
 *   - deriveBatchSteps() below, where step 3 is complete when that count is 0;
 *   - the Review step's "Needs Attention" tab, which must show exactly the rows
 *     the count is counting — otherwise the stepper says "24 need attention"
 *     while the tab the user is looking at is empty, or vice versa.
 *
 * scripts/check-review-step.ts parses the SQL and asserts all three match.
 */
export const NEEDS_ATTENTION_STATUSES = [
  'pending',
  'flagged',
  'discrepancy',
  'unmatched',
] as const;
export type NeedsAttentionStatus = (typeof NEEDS_ATTENTION_STATUSES)[number];

export const BATCH_STEPS = ['upload', 'match', 'review', 'approve'] as const;
export type BatchStepKey = (typeof BATCH_STEPS)[number];
/** 1 = Upload, 2 = Match, 3 = Review, 4 = Approve. */
export type BatchStepNumber = 1 | 2 | 3 | 4;

export type BatchStatus = 'open' | 'complete' | 'abandoned';

/** Exactly what public.batch_counts(uuid) returns. All non-negative integers. */
export interface BatchCounts {
  jobs_total: number;
  jobs_complete: number;
  jobs_failed: number;
  jobs_running: number;
  checks_total: number;
  matches_total: number;
  /** matches still in one of NEEDS_ATTENTION_STATUSES. */
  needs_attention: number;
  matched: number;
  approved: number;
  rejected: number;
}

export const EMPTY_COUNTS: BatchCounts = {
  jobs_total: 0,
  jobs_complete: 0,
  jobs_failed: 0,
  jobs_running: 0,
  checks_total: 0,
  matches_total: 0,
  needs_attention: 0,
  matched: 0,
  approved: 0,
  rejected: 0,
};

export interface BatchStep {
  step: BatchStepNumber;
  key: BatchStepKey;
  label: string;
  complete: boolean;
  /** True when every earlier step is complete, so the UI may open this step. */
  unlocked: boolean;
  /** Why this step is not complete yet. null once it is. */
  reason: string | null;
}

export interface BatchStepState {
  steps: BatchStep[];
  /** The step the user belongs on: the first incomplete one, else 4. */
  current_step: BatchStepNumber;
  /** The furthest step that may be opened. Never greater than current_step. */
  highest_unlocked_step: BatchStepNumber;
  /** For "Step 3 of 4". */
  total_steps: 4;
  /** Step 3 done, so Approve may be executed. Mirrors batch_can_complete(). */
  can_approve: boolean;
  counts: BatchCounts;
}

const LABELS: Record<BatchStepKey, string> = {
  upload: 'Upload',
  match: 'Match',
  review: 'Review',
  approve: 'Approve',
};

/** Coerce a row of counts (PostgREST returns bigint counts as numbers or strings). */
export function toCounts(raw: any): BatchCounts {
  const n = (v: any) => {
    const x = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
  };
  return {
    jobs_total: n(raw?.jobs_total),
    jobs_complete: n(raw?.jobs_complete),
    jobs_failed: n(raw?.jobs_failed),
    jobs_running: n(raw?.jobs_running),
    checks_total: n(raw?.checks_total),
    matches_total: n(raw?.matches_total),
    needs_attention: n(raw?.needs_attention),
    matched: n(raw?.matched),
    approved: n(raw?.approved),
    rejected: n(raw?.rejected),
  };
}

/**
 * The whole gating rule, in one place.
 *
 *   1 Upload   complete when at least one job finished extracting AND cheques
 *              came out of it. A job that errored, or finished with zero
 *              cheques, does not open Match.
 *   2 Match    complete when every extracted cheque has a match row. Matching
 *              writes one row per cheque (including 'unmatched'), so this is
 *              "the matcher has run over everything", not "everything matched".
 *   3 Review   complete when no match still needs attention.
 *   4 Approve  complete only when the batch itself was approved, which the
 *              database refuses unless step 3 holds.
 */
export function deriveBatchSteps(
  counts: BatchCounts,
  status: BatchStatus
): BatchStepState {
  const c = counts;

  const uploadComplete = c.jobs_complete >= 1 && c.checks_total > 0;
  const matchComplete =
    uploadComplete && c.checks_total > 0 && c.matches_total >= c.checks_total;
  const reviewComplete = matchComplete && c.needs_attention === 0;
  const approveComplete = reviewComplete && status === 'complete';

  const reasons: Record<BatchStepKey, string | null> = {
    upload: uploadComplete
      ? null
      : c.jobs_total === 0
        ? 'No documents uploaded yet.'
        : c.jobs_running > 0
          ? `${c.jobs_running} document${c.jobs_running === 1 ? '' : 's'} still extracting.`
          : c.checks_total === 0
            ? 'No cheques were extracted from the uploaded documents.'
            : 'No document has finished extracting.',
    match: matchComplete
      ? null
      : !uploadComplete
        ? 'Upload is not complete.'
        : `Matching has run over ${c.matches_total} of ${c.checks_total} cheques.`,
    review: reviewComplete
      ? null
      : !matchComplete
        ? 'Matching is not complete.'
        : `${c.needs_attention} cheque${c.needs_attention === 1 ? '' : 's'} need attention.`,
    approve: approveComplete
      ? null
      : !reviewComplete
        ? 'Review is not complete.'
        : 'Not approved yet.',
  };

  const completes = [uploadComplete, matchComplete, reviewComplete, approveComplete];

  const steps: BatchStep[] = BATCH_STEPS.map((key, i) => ({
    step: (i + 1) as BatchStepNumber,
    key,
    label: LABELS[key],
    complete: completes[i],
    // Unlocked only if every earlier step is complete — this is the property
    // that makes Approve unreachable from Upload.
    unlocked: completes.slice(0, i).every(Boolean),
    reason: reasons[key],
  }));

  const firstIncomplete = completes.findIndex((done) => !done);
  const current_step = (firstIncomplete === -1 ? 4 : firstIncomplete + 1) as BatchStepNumber;

  return {
    steps,
    current_step,
    highest_unlocked_step: current_step,
    total_steps: 4,
    can_approve: reviewComplete,
    counts: c,
  };
}

export interface StepGateResult {
  ok: boolean;
  /** The earliest step that is not complete and so blocks the jump. */
  blocking_step: BatchStepNumber | null;
  reason: string | null;
  /** Every unmet precondition, earliest first, for a UI that wants to list them. */
  missing: { step: BatchStepNumber; key: BatchStepKey; reason: string }[];
}

/**
 * May the caller move to `toStep`? The advance endpoint validates with this and
 * rejects; it never accepts a step number on trust.
 */
export function canEnterStep(
  toStep: number,
  state: BatchStepState
): StepGateResult {
  if (!Number.isInteger(toStep) || toStep < 1 || toStep > 4) {
    return {
      ok: false,
      blocking_step: null,
      reason: 'step must be an integer from 1 to 4.',
      missing: [],
    };
  }

  const missing = state.steps
    .slice(0, toStep - 1)
    .filter((s) => !s.complete)
    .map((s) => ({ step: s.step, key: s.key, reason: s.reason || 'Not complete.' }));

  if (missing.length > 0) {
    return {
      ok: false,
      blocking_step: missing[0].step,
      reason: `Step ${missing[0].step} (${LABELS[missing[0].key]}) is not complete: ${missing[0].reason}`,
      missing,
    };
  }

  return { ok: true, blocking_step: null, reason: null, missing: [] };
}

/** "August 2026" from a period start, for batches.period_label. */
export function periodLabel(periodStart: string): string {
  const d = new Date(`${periodStart.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return periodStart;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The shape every batch endpoint returns for one batch. */
export interface BatchPayload {
  id: string;
  tenant_id: string;
  created_by: string | null;
  realm_id: string;
  company_name: string | null;
  account_id: string | null;
  account_name: string | null;
  period_start: string;
  period_end: string;
  period_label: string | null;
  status: BatchStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Derived. Never read from the client. */
  state: BatchStepState;
  /** Ready-made for the Continue Reconciliation card. */
  summary: {
    /** "ABC Construction LLC · Operating Checking" */
    heading: string;
    /** "August 2026" */
    period: string;
    /** "Step 3 of 4" */
    step_label: string;
    /** "24 checks need attention" — null when none do. */
    attention_label: string | null;
    needs_attention: number;
  };
}

/**
 * Parse a batches row into the response payload.
 *
 * Throws on a row that is not a batch. Every endpoint asserts on this parsed
 * shape rather than on a status code: a tenant-scoped write that RLS silently
 * dropped comes back as no row, and that has to raise, not report success.
 */
export function toBatchPayload(row: any, counts: BatchCounts): BatchPayload {
  if (!row || typeof row !== 'object') {
    throw new Error('batch row missing — the write did not persist (check RLS and tenant_id)');
  }
  for (const field of ['id', 'tenant_id', 'realm_id', 'period_start', 'status'] as const) {
    if (!row[field]) {
      throw new Error(
        `batch row is missing ${field} — the write did not persist as expected (check RLS and tenant_id)`
      );
    }
  }

  const state = deriveBatchSteps(counts, row.status as BatchStatus);
  const period = row.period_label || periodLabel(row.period_start);
  const heading = [row.company_name, row.account_name].filter(Boolean).join(' · ')
    || row.realm_id;

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    created_by: row.created_by ?? null,
    realm_id: row.realm_id,
    company_name: row.company_name ?? null,
    account_id: row.account_id ?? null,
    account_name: row.account_name ?? null,
    period_start: row.period_start,
    period_end: row.period_end,
    period_label: row.period_label ?? null,
    status: row.status,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at ?? null,
    state,
    summary: {
      heading,
      period,
      step_label: `Step ${state.current_step} of 4`,
      attention_label:
        counts.needs_attention > 0
          ? `${counts.needs_attention} check${counts.needs_attention === 1 ? '' : 's'} need${counts.needs_attention === 1 ? 's' : ''} attention`
          : null,
      needs_attention: counts.needs_attention,
    },
  };
}
