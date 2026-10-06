'use client';

import { createClient } from '@/lib/supabase/client';
import type { BatchPayload, BatchStepNumber } from '@/lib/batch-state';

/**
 * The browser side of the batch contract (CHECKLIST section 3).
 *
 * Two rules live here, and the whole point of the parcel is that they are not
 * optional:
 *
 *  1. The client never decides a step. There is no "setStep" in this module:
 *     the only way to move is `advanceStep()`, which POSTs to
 *     /api/batches/[id]/advance and lets the server gate the jump. What the UI
 *     renders afterwards comes from `batch.state`, which is derived server-side
 *     in lib/batch-state.ts from counts only the pipeline can move.
 *
 *  2. A 409 is surfaced, never swallowed. `step_locked` comes back as a value
 *     carrying the blocking step and its reason, so a locked control can say
 *     why instead of being dead. Swallowing it would put the user back exactly
 *     where the v17 prototype left them: Approve reachable from Upload.
 *
 * `batch: null` from /resume is the normal state for a new firm — a first run,
 * not an error. And migration 032 has never been applied to any database, so
 * `503 migration_not_applied` is the response this code actually gets today; it
 * is reported honestly rather than faked into a zero-count batch.
 */

export type ReconcileFailure =
  | { kind: 'migration_not_applied'; message: string }
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'error'; message: string };

export type ResumeState =
  | { kind: 'batch'; batch: BatchPayload; resume_url: string }
  /** No open run. The first-run path into step 1, not an error. */
  | { kind: 'first_run'; reason: string }
  | ReconcileFailure;

export type AdvanceResult =
  | {
      kind: 'ok';
      entered_step: BatchStepNumber;
      finalized: boolean;
      batch: BatchPayload;
    }
  | {
      kind: 'step_locked';
      blocking_step: BatchStepNumber | null;
      reason: string;
      missing: { step: BatchStepNumber; key: string; reason: string }[];
      current_step: BatchStepNumber | null;
      batch: BatchPayload | null;
    }
  | ReconcileFailure;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Map a non-2xx body onto the one failure shape. Never throws. */
function toFailure(status: number, body: any): ReconcileFailure {
  const message =
    body?.message || body?.error || `Request failed (${status}).`;
  if (status === 503 || body?.error === 'migration_not_applied') {
    return {
      kind: 'migration_not_applied',
      message:
        body?.message ||
        'Reconciliation batches are not available yet — migration 032 has not been applied to this database.',
    };
  }
  if (status === 401) return { kind: 'unauthenticated', message };
  return { kind: 'error', message };
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** GET /api/batches/resume — what the Continue Reconciliation card renders. */
export async function loadResume(): Promise<ResumeState> {
  try {
    const { status, body } = await getJson('/api/batches/resume');
    if (status !== 200) return toFailure(status, body);
    // 200 with batch: null is the documented "nothing to resume" answer.
    if (!body?.batch) {
      return { kind: 'first_run', reason: String(body?.reason || 'no_open_batch') };
    }
    return {
      kind: 'batch',
      batch: body.batch as BatchPayload,
      resume_url: String(body.resume_url || `/reconcile?batch=${body.batch.id}`),
    };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

/** GET /api/batches/[id] — the poll the Match screen advances on. */
export async function loadBatch(id: string): Promise<
  { kind: 'batch'; batch: BatchPayload } | ReconcileFailure
> {
  try {
    const { status, body } = await getJson(`/api/batches/${id}`);
    if (status !== 200 || !body?.batch) return toFailure(status, body);
    return { kind: 'batch', batch: body.batch as BatchPayload };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

/**
 * POST /api/batches/[id]/advance — the ONLY way a step changes.
 *
 * Clicking a step calls this; the server either confirms the step or answers
 * 409 step_locked with the reason, which the caller shows.
 */
export async function advanceStep(
  batchId: string,
  step: BatchStepNumber,
  opts: { finalize?: boolean } = {}
): Promise<AdvanceResult> {
  try {
    const res = await fetch(`/api/batches/${batchId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ step, ...(opts.finalize ? { finalize: true } : {}) }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.status === 409 && body?.error === 'step_locked') {
      return {
        kind: 'step_locked',
        blocking_step: (body.blocking_step ?? null) as BatchStepNumber | null,
        reason: String(body.reason || 'That step is not available yet.'),
        missing: Array.isArray(body.missing) ? body.missing : [],
        current_step: (body.current_step ?? null) as BatchStepNumber | null,
        batch: (body.batch ?? null) as BatchPayload | null,
      };
    }
    if (!res.ok || !body?.ok || !body?.batch) return toFailure(res.status, body);

    return {
      kind: 'ok',
      entered_step: body.entered_step as BatchStepNumber,
      finalized: body.finalized === true,
      batch: body.batch as BatchPayload,
    };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

/**
 * Start OAuth from inside the flow.
 *
 * /api/qbo/auth answers with {authUrl} as JSON and does NOT redirect, so an
 * <a href> pointed at it navigates the user to a raw JSON document. Same
 * fetch-then-redirect fix as components/CompanySwitcher.tsx.
 */
export async function startQuickBooksConnect(): Promise<string | null> {
  const { status, body } = await getJson('/api/qbo/auth');
  if (status !== 200 || !body?.authUrl) return null;
  return String(body.authUrl);
}
