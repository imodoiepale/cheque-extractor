import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { auditLog } from '@/lib/team-helpers';
import {
  BATCH_COLUMNS,
  BatchError,
  cleanText,
  isMissingObject,
  isUuid,
  loadBatch,
  loadBatchCounts,
  sendBatchError,
} from '@/lib/batch-helpers';
import { toBatchPayload } from '@/lib/batch-state';

/**
 * GET   /api/batches/[id]  — one batch with per-step state and counts
 * PATCH /api/batches/[id]  — the few fields a user may edit
 *
 * PATCH deliberately accepts only { company_name, account_id, account_name,
 * notes, status: 'abandoned' }. It cannot set a step, cannot set
 * status: 'complete' (that is POST .../advance with step 4, and the database
 * refuses it anyway), and cannot move a batch between tenants.
 */

const PATCHABLE_TEXT = ['company_name', 'account_id', 'account_name', 'notes'] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    if (!isUuid(id)) {
      return res.status(400).json({ error: 'invalid_id', message: 'batch id must be a uuid.' });
    }

    if (req.method === 'GET') {
      const ctx = await requireCapability(req, res, 'checks.view');
      if (!ctx) return;
      const batch = await loadBatch(ctx.supabase, ctx.tenantId, id);
      return res.status(200).json({ batch });
    }

    if (req.method === 'PATCH') {
      const ctx = await requireCapability(req, res, 'checks.edit');
      if (!ctx) return;
      const { supabase, tenantId, userId } = ctx;
      const body = (req.body || {}) as Record<string, any>;

      const updates: Record<string, any> = {};
      for (const field of PATCHABLE_TEXT) {
        if (field in body) updates[field] = cleanText(body[field], field === 'notes' ? 2000 : 200);
      }
      if (body.status === 'abandoned') updates.status = 'abandoned';
      else if ('status' in body && body.status !== undefined) {
        throw new BatchError(
          400,
          'status_not_settable',
          "status can only be set to 'abandoned' here. Completing a batch goes through POST /api/batches/[id]/advance with step 4, which validates the prior steps."
        );
      }

      if (Object.keys(updates).length === 0) {
        throw new BatchError(400, 'nothing_to_update', 'No editable field was supplied.');
      }

      const { data, error } = await supabase
        .from('batches')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
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
        throw new BatchError(500, 'update_failed', error.message);
      }
      // No row back means the update matched nothing the caller may see: RLS or
      // a wrong tenant, not a success.
      if (!data?.id) {
        throw new BatchError(
          404,
          'not_persisted',
          'No batch was updated. Either it does not exist for this firm, or RLS rejected the write.'
        );
      }

      await auditLog({
        tenantId,
        userId,
        action: 'batch.updated',
        entityType: 'batch',
        entityId: data.id,
        newValues: updates,
      });

      const counts = await loadBatchCounts(supabase, data.id);
      return res.status(200).json({ batch: toBatchPayload(data, counts) });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err: any) {
    return sendBatchError(res, err);
  }
}
