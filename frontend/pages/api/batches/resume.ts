import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import {
  BATCH_COLUMNS,
  BatchError,
  isMissingObject,
  loadBatchCounts,
  sendBatchError,
} from '@/lib/batch-helpers';
import { toBatchPayload } from '@/lib/batch-state';

/**
 * GET /api/batches/resume
 *
 * The one endpoint behind the Continue Reconciliation card (CHECKLIST section
 * 3): "If someone closes Kyriq mid-flow, they resume exactly where they
 * stopped with no re-upload and no re-approval."
 *
 * Response, when there is something to resume:
 *   200 { batch: BatchPayload, resume_url: "/reconcile?batch=<id>&step=<n>" }
 * and when there is not — which is the normal state for a new firm, not an
 * error:
 *   200 { batch: null, resume_url: null, reason: "no_open_batch" }
 *
 * The card renders batch.summary:
 *   heading "ABC Construction LLC · Operating Checking"
 *   period  "August 2026"
 *   step_label "Step 3 of 4"
 *   attention_label "24 checks need attention"  (null when none do)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const ctx = await requireCapability(req, res, 'checks.view');
    if (!ctx) return;
    const { supabase, tenantId, userId } = ctx;

    // The caller's own open run first; failing that, the firm's most recently
    // touched open run, so a colleague can pick up where someone else stopped.
    const { data, error } = await supabase
      .from('batches')
      .select(BATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) {
      if (isMissingObject(error)) {
        throw new BatchError(
          503,
          'migration_not_applied',
          'The batches table is missing — apply supabase/migrations/032_batches.sql.'
        );
      }
      throw new BatchError(500, 'read_failed', error.message);
    }

    const rows: any[] = Array.isArray(data) ? data : [];
    const row = rows.find((r) => r.created_by === userId) || rows[0] || null;

    if (!row) {
      return res.status(200).json({ batch: null, resume_url: null, reason: 'no_open_batch' });
    }

    const counts = await loadBatchCounts(supabase, row.id);
    const batch = toBatchPayload(row, counts);

    return res.status(200).json({
      batch,
      resume_url: `/reconcile?batch=${batch.id}&step=${batch.state.current_step}`,
    });
  } catch (err: any) {
    return sendBatchError(res, err);
  }
}
