/**
 * Upload retention — the pure part (CHECKLIST section 13).
 *
 * "Delete uploaded files 14 days after the reconciliation completes, keeping
 * the extracted data and the history."
 *
 * Three decisions live here and nowhere else:
 *
 *   1. FOURTEEN days, not seven. Michael asked for one or the other; 14 is the
 *      agreed default because a firm that pauses mid-month would otherwise
 *      lose files it still needs.
 *   2. Counted from COMPLETION, not from upload — for the same reason. The
 *      clock starts when the reconciliation is finished with the file.
 *   3. Only the source PDF goes. `pdfObjectsIn()` is the whole definition of
 *      "what gets deleted": objects directly inside the job folder whose name
 *      ends in .pdf. The extracted cheque data, the cropped check images
 *      (images/), the page renders (pages/), the per-engine OCR JSON
 *      (ocr_results/) and extraction_summary.json are not that, and the batch
 *      row is not even in storage.
 *
 * This module is pure — no Supabase, no request — so the rules are testable
 * without a database. scripts/check-history-reports.ts asserts them, including
 * that applying a sweep twice changes nothing the second time.
 */

/** Must equal public.upload_retention_days() in migration 035. */
export const RETENTION_DAYS = 14;

export const RETENTION_BUCKET = 'checks';

const DAY_MS = 86_400_000;

/** The job folder a source PDF lives in: `jobs/{job_id}`. */
export function jobStoragePrefix(jobId: string): string {
  return `jobs/${jobId}`;
}

/** When a batch that completed at `completedAt` has its source PDFs deleted. */
export function retentionDeleteAfter(completedAt: string | Date): string {
  const at = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`retentionDeleteAfter: ${String(completedAt)} is not a date`);
  }
  return new Date(at.getTime() + RETENTION_DAYS * DAY_MS).toISOString();
}

/** Human form for the UI and the privacy page. */
export const RETENTION_SENTENCE =
  `Uploaded source PDFs are deleted ${RETENTION_DAYS} days after the reconciliation they ` +
  `belong to is completed. The extracted cheque data, the match results and the ` +
  `reconciliation history are kept.`;

/** One entry as Supabase Storage `list()` returns it. A folder has `id: null`. */
export interface StorageEntry {
  name: string;
  id?: string | null;
}

/**
 * The source PDFs inside one job folder, as full object paths.
 *
 * Deliberately narrow:
 *   - `.pdf` only, case-insensitive;
 *   - direct children only — anything with a slash in its name, or any entry
 *     Storage reports as a folder (`id: null`), is skipped, which is what keeps
 *     images/, pages/ and ocr_results/ out of reach;
 *   - no recursion. There is no path by which this function can name a file
 *     outside the one job folder it was given.
 */
export function pdfObjectsIn(prefix: string, entries: StorageEntry[]): string[] {
  const base = prefix.replace(/\/+$/, '');
  return (entries || [])
    .filter(
      (e) =>
        e &&
        typeof e.name === 'string' &&
        e.id !== null && // a folder
        !e.name.includes('/') &&
        /\.pdf$/i.test(e.name)
    )
    .map((e) => `${base}/${e.name}`);
}

export type RetentionOutcome = 'deleted' | 'missing' | 'failed';

/** One row of the sweep, as `public.upload_retention_due()` returns it. */
export interface RetentionDue {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  job_id: string;
  storage_bucket: string;
  storage_prefix: string;
  storage_path: string | null;
  delete_after: string;
  attempts: number;
}

/**
 * What one row's outcome is, given what storage said.
 *
 * A file that is already gone is a SUCCESS ('missing'), never a failure: the
 * obligation was to have no file, and there is no file. That single rule is
 * what makes a second sweep harmless.
 */
export function sweepOutcome(args: {
  listError?: string | null;
  removeError?: string | null;
  pdfPaths: string[];
}): { outcome: RetentionOutcome; objects_deleted: number; error: string | null } {
  if (args.listError) {
    return { outcome: 'failed', objects_deleted: 0, error: args.listError };
  }
  if (args.pdfPaths.length === 0) {
    return { outcome: 'missing', objects_deleted: 0, error: null };
  }
  if (args.removeError) {
    return { outcome: 'failed', objects_deleted: 0, error: args.removeError };
  }
  return { outcome: 'deleted', objects_deleted: args.pdfPaths.length, error: null };
}

/** Terminal states. A row in one of these is never swept again. */
export const SETTLED: RetentionOutcome[] = ['deleted', 'missing'];

export function isSettled(status: string): boolean {
  return (SETTLED as string[]).includes(status);
}

export interface SweepTally {
  swept: number;
  deleted: number;
  already_gone: number;
  failed: number;
  objects_deleted: number;
}

export const EMPTY_TALLY: SweepTally = {
  swept: 0,
  deleted: 0,
  already_gone: 0,
  failed: 0,
  objects_deleted: 0,
};

export function tally(t: SweepTally, outcome: RetentionOutcome, objects: number): SweepTally {
  return {
    swept: t.swept + 1,
    deleted: t.deleted + (outcome === 'deleted' ? 1 : 0),
    already_gone: t.already_gone + (outcome === 'missing' ? 1 : 0),
    failed: t.failed + (outcome === 'failed' ? 1 : 0),
    objects_deleted: t.objects_deleted + objects,
  };
}
