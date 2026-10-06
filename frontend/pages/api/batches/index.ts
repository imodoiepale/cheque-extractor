import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability, getActiveRealm } from '@/lib/match-helpers';
import { auditLog } from '@/lib/team-helpers';
import {
  BATCH_COLUMNS,
  BatchError,
  cleanText,
  isIsoDate,
  isMissingObject,
  loadBatchCounts,
  sendBatchError,
} from '@/lib/batch-helpers';
import {
  EMPTY_COUNTS,
  periodLabel,
  toBatchPayload,
  toCounts,
  type BatchPayload,
} from '@/lib/batch-state';

/**
 * GET  /api/batches   — list batches (History, CHECKLIST section 13)
 * POST /api/batches   — create or open the batch for a company+account+period
 *
 * A batch is one reconciliation run. Step state is never accepted from the
 * client: see lib/batch-state.ts.
 */

const LIST_MAX = 100;

async function listBatches(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { supabase, tenantId } = ctx;

  const statusParam = String(req.query.status || 'all');
  const status = ['open', 'complete', 'abandoned', 'all'].includes(statusParam)
    ? statusParam
    : 'all';
  const realmId = cleanText(req.query.realm_id, 64);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '25'), 10) || 25, 1), LIST_MAX);
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

  let query = supabase
    .from('batches')
    .select(BATCH_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (realmId) query = query.eq('realm_id', realmId);

  const { data, error, count } = await query;

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

  const rows = Array.isArray(data) ? data : [];

  // Counts for the whole page in one round trip.
  let countsById: Record<string, any> = {};
  if (rows.length > 0) {
    const { data: many, error: manyErr } = await supabase.rpc('batch_counts_many', {
      p_batch_ids: rows.map((r: any) => r.id),
    });
    if (manyErr) {
      if (isMissingObject(manyErr)) {
        throw new BatchError(
          503,
          'migration_not_applied',
          'public.batch_counts_many() is missing — apply supabase/migrations/032_batches.sql.'
        );
      }
      throw new BatchError(500, 'counts_failed', manyErr.message);
    }
    countsById = many && typeof many === 'object' ? many : {};
  }

  const batches: BatchPayload[] = rows.map((row: any) =>
    toBatchPayload(row, countsById[row.id] ? toCounts(countsById[row.id]) : EMPTY_COUNTS)
  );

  return res.status(200).json({
    batches,
    total: typeof count === 'number' ? count : batches.length,
    limit,
    offset,
  });
}

async function createBatch(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { supabase, tenantId, userId } = ctx;
  const body = (req.body || {}) as Record<string, any>;

  const period_start = body.period_start;
  const period_end = body.period_end;
  if (!isIsoDate(period_start) || !isIsoDate(period_end)) {
    throw new BatchError(
      400,
      'invalid_period',
      'period_start and period_end are required, as YYYY-MM-DD dates.'
    );
  }
  if (period_end < period_start) {
    throw new BatchError(400, 'invalid_period', 'period_end must not precede period_start.');
  }

  // The company is server-side state (CHECKLIST section 4): the active
  // qb_connections row, unless the caller names a realm explicitly.
  const requested = cleanText(body.realm_id, 64);
  const realm_id = requested || (await getActiveRealm(supabase, tenantId));
  if (!realm_id) {
    throw new BatchError(
      409,
      'no_active_company',
      'No QuickBooks company is connected or selected. Connect a company before starting a reconciliation.'
    );
  }

  // Confirm the realm belongs to this tenant, so a crafted realm_id cannot
  // create a batch pointing at someone else's company.
  const { data: conn, error: connErr } = await supabase
    .from('qb_connections')
    .select('realm_id, company_name')
    .eq('tenant_id', tenantId)
    .eq('realm_id', realm_id)
    .maybeSingle();
  if (connErr && !isMissingObject(connErr)) {
    throw new BatchError(500, 'read_failed', connErr.message);
  }
  if (!conn) {
    throw new BatchError(404, 'company_not_found', 'That QuickBooks company is not connected to this firm.');
  }

  const account_id = cleanText(body.account_id, 64);
  const account_name = cleanText(body.account_name, 200);
  const company_name = cleanText(body.company_name, 200) || cleanText(conn.company_name, 200);

  // Open / idempotent: the same company+account+period reopens the run that is
  // already in flight rather than starting a second one. The partial unique
  // index in migration 032 is the backstop if two requests race.
  let existingQuery = supabase
    .from('batches')
    .select(BATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('realm_id', realm_id)
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .eq('status', 'open')
    .limit(1);
  existingQuery = account_id
    ? existingQuery.eq('account_id', account_id)
    : account_name
      ? existingQuery.eq('account_name', account_name)
      : existingQuery;

  const { data: existingRows, error: existingErr } = await existingQuery;
  if (existingErr) {
    if (isMissingObject(existingErr)) {
      throw new BatchError(
        503,
        'migration_not_applied',
        'The batches table is missing — apply supabase/migrations/032_batches.sql.'
      );
    }
    throw new BatchError(500, 'read_failed', existingErr.message);
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing) {
    const counts = await loadBatchCounts(supabase, existing.id);
    return res.status(200).json({ created: false, batch: toBatchPayload(existing, counts) });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('batches')
    .insert({
      // Every write carries tenant_id.
      tenant_id: tenantId,
      created_by: userId,
      realm_id,
      company_name,
      account_id,
      account_name,
      period_start,
      period_end,
      period_label: cleanText(body.period_label, 64) || periodLabel(period_start),
      notes: cleanText(body.notes, 2000),
      status: 'open',
    })
    .select(BATCH_COLUMNS)
    .maybeSingle();

  if (insertErr) {
    if (isMissingObject(insertErr)) {
      throw new BatchError(
        503,
        'migration_not_applied',
        'The batches table is missing — apply supabase/migrations/032_batches.sql.'
      );
    }
    // The partial unique index: another request opened the same run first.
    if (String(insertErr.code) === '23505') {
      throw new BatchError(
        409,
        'already_open',
        'A reconciliation for this company, account and period is already open.'
      );
    }
    throw new BatchError(500, 'insert_failed', insertErr.message);
  }

  // Assert on the parsed row, not on the absence of an error. An insert that
  // RLS dropped returns no row while looking like a success.
  if (!inserted?.id) {
    throw new BatchError(
      500,
      'insert_not_persisted',
      'The batch was not persisted. This is an RLS or tenant_id mismatch, not a client error.'
    );
  }

  await auditLog({
    tenantId,
    userId,
    action: 'batch.created',
    entityType: 'batch',
    entityId: inserted.id,
    newValues: {
      realm_id,
      account_id,
      account_name,
      period_start,
      period_end,
    },
  });

  // A brand-new batch has no jobs, so the counts are known to be empty; skip
  // the round trip and derive step 1 from zeroes.
  return res.status(201).json({ created: true, batch: toBatchPayload(inserted, EMPTY_COUNTS) });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const ctx = await requireCapability(req, res, 'checks.view');
      if (!ctx) return;
      return await listBatches(req, res, ctx);
    }
    if (req.method === 'POST') {
      const ctx = await requireCapability(req, res, 'checks.upload');
      if (!ctx) return;
      return await createBatch(req, res, ctx);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err: any) {
    return sendBatchError(res, err);
  }
}
