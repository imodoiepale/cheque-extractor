import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { auditLog } from '@/lib/team-helpers';
import {
  BATCH_COLUMNS,
  BatchError,
  isMissingObject,
  isUuid,
  loadBatch,
  loadBatchCounts,
  sendBatchError,
} from '@/lib/batch-helpers';
import { canEnterStep, toBatchPayload } from '@/lib/batch-state';

/**
 * POST /api/batches/[id]/advance
 *
 * The stepper's only way to move. It VALIDATES, it does not accept:
 *
 *   body { step: 1 | 2 | 3 | 4, finalize?: boolean }
 *
 * Step N may be entered only when steps 1..N-1 are genuinely complete, where
 * "complete" is derived from counts the pipeline writes (see
 * lib/batch-state.ts). A request for step 4 from a batch that has only just
 * uploaded gets 409 with the blocking step and the reason — which is exactly
 * the hole in the v17 prototype, where Approve was a link reachable from
 * Upload.
 *
 *   200 { ok: true, entered_step, finalized, batch }
 *   409 { error: 'step_locked', blocking_step, reason, missing: [...], batch }
 *
 * `finalize: true` (step 4 only) is the Approve action: it sets
 * status = 'complete' and stamps approved_by/approved_at. Migration 032's
 * trigger re-checks the same preconditions inside the database, so a caller
 * that skips this endpoint entirely still cannot complete a batch early.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { id } = req.query;
    if (!isUuid(id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'batch id must be a uuid.' });
    }

    const ctx = await requireCapability(req, res, 'checks.edit');
    if (!ctx) return;
    const { supabase, tenantId, userId } = ctx;

    const body = (req.body || {}) as Record<string, any>;
    const raw = body.step ?? body.to_step;
    const step = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    if (!Number.isInteger(step) || step < 1 || step > 4) {
      throw new BatchError(400, 'invalid_step', 'step must be an integer from 1 to 4.');
    }
    const finalize = body.finalize === true;
    if (finalize && step !== 4) {
      throw new BatchError(400, 'invalid_finalize', 'finalize is only valid with step 4 (Approve).');
    }

    const batch = await loadBatch(supabase, tenantId, id);

    if (batch.status === 'abandoned') {
      throw new BatchError(409, 'batch_abandoned', 'This reconciliation was abandoned.');
    }

    // Already approved: answer idempotently rather than erroring, so a double
    // click on Approve does not look like a failure.
    if (batch.status === 'complete') {
      return res.status(200).json({
        ok: true,
        entered_step: 4,
        finalized: false,
        already_complete: true,
        batch,
      });
    }

    const gate = canEnterStep(step, batch.state);
    if (!gate.ok) {
      return res.status(409).json({
        error: 'step_locked',
        blocking_step: gate.blocking_step,
        reason: gate.reason,
        missing: gate.missing,
        current_step: batch.state.current_step,
        batch,
      });
    }

    if (!finalize) {
      // Nothing to persist: the step is derived, so "entering" it is a read.
      return res.status(200).json({
        ok: true,
        entered_step: step,
        finalized: false,
        batch,
      });
    }

    // Approve. canEnterStep(4) already proved steps 1-3 are complete, which is
    // the same condition public.batch_can_complete() enforces in the trigger.
    const { data, error } = await supabase
      .from('batches')
      .update({ status: 'complete', approved_by: userId })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .select(BATCH_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isMissingObject(error)) {
        throw new BatchError(
          503,
          'migration_not_applied',
          'The batches table is missing — apply supabase/migrations/032_batches.sql.'
        );
      }
      // The trigger refusing the transition is a precondition failure, not a
      // server fault: report it as one.
      if (/cannot be approved|cannot be reopened|immutable/.test(String(error.message))) {
        throw new BatchError(409, 'step_locked', error.message, { blocking_step: 3 });
      }
      throw new BatchError(500, 'update_failed', error.message);
    }
    if (!data?.id) {
      throw new BatchError(
        409,
        'not_persisted',
        'The batch was not approved. It was changed by someone else, or RLS rejected the write.'
      );
    }

    await auditLog({
      tenantId,
      userId,
      action: 'batch.approved',
      entityType: 'batch',
      entityId: data.id,
      oldValues: { status: 'open' },
      newValues: { status: 'complete', approved_by: userId },
      metadata: { counts: batch.state.counts },
    });

    const counts = await loadBatchCounts(supabase, data.id);
    return res.status(200).json({
      ok: true,
      entered_step: 4,
      finalized: true,
      batch: toBatchPayload(data, counts),
    });
  } catch (err: any) {
    return sendBatchError(res, err);
  }
}
