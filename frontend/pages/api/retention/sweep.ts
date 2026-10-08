import type { NextApiRequest, NextApiResponse } from 'next';
import { cronAuthorised } from '@/lib/billing/service';
import { createServiceClient } from '@/lib/supabase/api';
import { isMissingObject } from '@/lib/batch-helpers';
import {
  EMPTY_TALLY,
  pdfObjectsIn,
  sweepOutcome,
  tally,
  type RetentionDue,
  type SweepTally,
} from '@/lib/retention';

/**
 * POST /api/retention/sweep   (cron / operator)
 *
 * The job that actually deletes. CHECKLIST section 13: "Delete uploaded files
 * 14 days after the reconciliation completes, keeping the extracted data and
 * the history."
 *
 * The record of WHAT to delete and WHEN is public.upload_retention, written by
 * a trigger when a batch completes (migration 035). This endpoint only works
 * the queue:
 *
 *   1. public.upload_retention_due(limit) — pending/failed rows whose
 *      delete_after has passed.
 *   2. For each: list the job's storage folder, remove the objects directly
 *      inside it whose name ends in .pdf. That filter is in lib/retention.ts
 *      and is the whole definition of what may be deleted — the cropped check
 *      images, the page renders and the OCR JSON live in sub-folders and are
 *      unreachable from here, and no checks / matches / batches row is touched.
 *   3. public.complete_upload_retention(...) — record the outcome.
 *
 * IDEMPOTENCE, which is the property that matters most here:
 *   - a file that is already gone is recorded as 'missing', which is a SUCCESS;
 *   - 'deleted' and 'missing' are terminal, so upload_retention_due() does not
 *     return the row again — a second sweep in the same minute finds nothing;
 *   - complete_upload_retention() on an already-settled row returns
 *     already_settled: true instead of raising;
 *   - Storage's remove() on a missing key is not treated as an error.
 *
 * Auth: BILLING_CRON_SECRET, via the existing cronAuthorised() gate — the repo
 * has one cron secret and this is it. No tenant user can call this.
 *
 * Nothing here has been run against a database: migration 035 has never been
 * applied anywhere, so `503 retention_not_available` is the honest answer this
 * endpoint gives today.
 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET is allowed because Vercel Cron invokes a route with GET; POST stays for
  // a manual or external trigger. Either way cronAuthorised() is the gate.
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!cronAuthorised(req)) {
    return res.status(401).json({
      error: 'unauthorised',
      message: 'BILLING_CRON_SECRET required.',
    });
  }

  const body = (req.body || {}) as Record<string, any>;
  const limit = Math.min(
    Math.max(parseInt(String(body.limit ?? req.query.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const dryRun = body.dry_run === true || req.query.dry_run === 'true';

  const svc = createServiceClient();

  const { data: due, error: dueErr } = await svc.rpc('upload_retention_due', { p_limit: limit });

  if (dueErr) {
    if (isMissingObject(dueErr)) {
      return res.status(503).json({
        error: 'retention_not_available',
        message:
          'public.upload_retention_due() is missing — apply ' +
          'supabase/migrations/035_history_reports_and_retention.sql.',
      });
    }
    return res.status(500).json({ error: 'due_query_failed', message: dueErr.message });
  }

  const rows: RetentionDue[] = Array.isArray(due) ? due : [];

  if (dryRun) {
    return res.status(200).json({
      dry_run: true,
      due: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        job_id: r.job_id,
        bucket: r.storage_bucket,
        prefix: r.storage_prefix,
        delete_after: r.delete_after,
      })),
    });
  }

  let t: SweepTally = EMPTY_TALLY;
  const failures: { id: string; job_id: string; error: string }[] = [];

  for (const row of rows) {
    const bucket = row.storage_bucket || 'checks';
    const prefix = row.storage_prefix;

    const { data: entries, error: listErr } = await svc.storage.from(bucket).list(prefix, {
      limit: 1000,
    });

    const pdfPaths = listErr ? [] : pdfObjectsIn(prefix, (entries || []) as any[]);

    let removeError: string | null = null;
    if (!listErr && pdfPaths.length > 0) {
      const { error: rmErr } = await svc.storage.from(bucket).remove(pdfPaths);
      // Storage answers 200 for a key that was already gone, so an error here
      // is a real refusal (permissions, bucket missing) and must be retried.
      if (rmErr) removeError = rmErr.message;
    }

    const outcome = sweepOutcome({
      listError: listErr ? listErr.message : null,
      removeError,
      pdfPaths,
    });

    const { data: marked, error: markErr } = await svc.rpc('complete_upload_retention', {
      p_id: row.id,
      p_outcome: outcome.outcome,
      p_objects_deleted: outcome.objects_deleted,
      p_error: outcome.error,
    });

    if (markErr) {
      // The file may be gone while the record still says pending. Surfaced, not
      // swallowed: the next sweep will list an empty folder and settle the row
      // as 'missing', which is why that outcome exists.
      failures.push({ id: row.id, job_id: row.job_id, error: markErr.message });
      t = tally(t, 'failed', 0);
      continue;
    }
    if (marked && (marked as any).already_settled === true) {
      // Another sweep settled it between the due query and now. Not an error.
      t = tally(t, 'missing', 0);
      continue;
    }
    if (outcome.outcome === 'failed' && outcome.error) {
      failures.push({ id: row.id, job_id: row.job_id, error: outcome.error });
    }
    t = tally(t, outcome.outcome, outcome.objects_deleted);
  }

  return res.status(200).json({
    ...t,
    due_returned: rows.length,
    more_due: rows.length === limit,
    failures,
  });
}
