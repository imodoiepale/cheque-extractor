import {
  toCounts,
  toBatchPayload,
  type BatchCounts,
  type BatchPayload,
} from '@/lib/batch-state';

/**
 * Server-side loaders for the batches endpoints.
 *
 * Auth is NOT resolved here: every route uses getAuthContext/requireCapability
 * from lib/match-helpers.ts. There is deliberately only one auth resolver.
 *
 * Every query filters on tenant_id explicitly as well as relying on RLS, so a
 * route still isolates tenants on a database where migration 032's policies
 * have not been applied yet.
 */

/** The columns the UI contract covers. Listed, not `*`, so the shape is fixed. */
export const BATCH_COLUMNS =
  'id, tenant_id, created_by, realm_id, company_name, account_id, account_name, ' +
  'period_start, period_end, period_label, status, approved_by, approved_at, ' +
  'notes, created_at, updated_at, completed_at';

export class BatchError extends Error {
  status: number;
  code: string;
  extra: Record<string, any>;

  constructor(status: number, code: string, message: string, extra: Record<string, any> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** True when the error is "this table/function is not in the database". */
export function isMissingObject(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return (
    /PGRST202|PGRST205|42P01|42883/.test(code) ||
    /does not exist|Could not find the (table|function)/i.test(msg)
  );
}

/**
 * The counts every step decision is derived from.
 *
 * Deliberately no silent fallback: if public.batch_counts() is absent the
 * migration has not been applied, and answering with zeroes would render
 * "Step 1 of 4" on a batch that is actually finished.
 */
export async function loadBatchCounts(
  supabase: any,
  batchId: string
): Promise<BatchCounts> {
  const { data, error } = await supabase.rpc('batch_counts', { p_batch_id: batchId });

  if (error) {
    if (isMissingObject(error)) {
      throw new BatchError(
        503,
        'migration_not_applied',
        'public.batch_counts() is missing — apply supabase/migrations/032_batches.sql.'
      );
    }
    throw new BatchError(500, 'counts_failed', error.message);
  }
  if (!data || typeof data !== 'object') {
    throw new BatchError(500, 'counts_failed', 'batch_counts() returned no object');
  }
  return toCounts(data);
}

/**
 * One batch, with its derived step state.
 *
 * Asserts on the parsed row, never on a status code: a select that RLS filtered
 * to nothing comes back as `data: null, error: null`, which is a 404 here and
 * never an empty "success".
 */
export async function loadBatch(
  supabase: any,
  tenantId: string,
  batchId: string
): Promise<BatchPayload> {
  const { data, error } = await supabase
    .from('batches')
    .select(BATCH_COLUMNS)
    .eq('id', batchId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

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
  if (!data) {
    throw new BatchError(404, 'not_found', 'Batch not found.');
  }

  const counts = await loadBatchCounts(supabase, batchId);
  return toBatchPayload(data, counts);
}

/** uuid shape check at the trust boundary, before any query uses the value. */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** YYYY-MM-DD, and a real date. Rejects '2026-02-31' and anything else. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Trim to a bounded string, or null. Keeps hostile payloads out of the row. */
export function cleanText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Turn a BatchError (or anything else) into the one error response shape. */
export function sendBatchError(res: any, err: any) {
  if (err instanceof BatchError) {
    return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
  }
  const message = err?.message || 'Unexpected error';
  if (/Not authenticated|No tenant found/.test(message)) {
    return res.status(401).json({ error: 'unauthenticated', message });
  }
  console.error('[batches]', message);
  return res.status(500).json({ error: 'server_error', message });
}
