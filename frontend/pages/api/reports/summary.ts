import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCapability } from '@/lib/match-helpers';
import { createServiceClient } from '@/lib/supabase/api';
import { cleanText, isIsoDate, isMissingObject } from '@/lib/batch-helpers';
import { auditLog } from '@/lib/team-helpers';

/**
 * GET /api/reports/summary — the Reports page (CHECKLIST section 13)
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   the date filter (required pair, or the
 *                                    current billing period is used)
 *   &realm_id=                       the company filter
 *   &account=                        the account filter (id or name)
 *   &batch_id=                       one reconciliation, for History's Export
 *   &format=csv                      download instead of JSON
 *
 * ADMINISTRATOR ONLY, enforced HERE and not merely by hiding a menu item:
 * `reports.view` and `reports.export` are Administrator-only in lib/roles.ts,
 * so a plain User calling this endpoint directly gets 403. That is the
 * acceptance test. Migration 030's restrictive policy on export_history is the
 * second, independent gate.
 *
 * Every figure comes from public.report_summary() (migration 035), which counts
 * rows that already exist — batches, checks, matches, usage_ledger (027) and
 * export_history (001). There is no new aggregation layer and no stored
 * rollup, so a number here cannot drift from the data it describes. The
 * response carries `sources`, saying which of those tables the database
 * actually has: a figure is reported as unavailable rather than as zero.
 *
 * Nothing here has run against a database — migrations 026-035 have never been
 * applied, so `503 migration_not_applied` is the answer this endpoint gives
 * today, and the page says so rather than drawing empty charts.
 */

function monthWindow(now = new Date()): { from: string; to: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** RFC 4180-ish: quote everything, double the quotes. No injection surface. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(report: any): string {
  const lines: string[] = [];
  const pair = (k: string, v: unknown) => lines.push([csvCell(k), csvCell(v)].join(','));

  lines.push([csvCell('Kyriq report'), csvCell('')].join(','));
  pair('From', report?.range?.from);
  pair('To', report?.range?.to);
  pair('Company (realm id)', report?.filters?.realm_id ?? 'All');
  pair('Account', report?.filters?.account ?? 'All');
  lines.push('');

  pair('Cheques processed (usage_ledger)', report?.cheques_processed?.count ?? 0);
  pair('Reconciliations in period', report?.batches?.total ?? 0);
  pair('Completed', report?.batches?.complete ?? 0);
  pair('Open', report?.batches?.open ?? 0);
  pair('Abandoned', report?.batches?.abandoned ?? 0);
  pair('Approved', report?.batches?.approved ?? 0);
  pair('Cheques in those reconciliations', report?.volume?.checks_total ?? 0);
  pair('Matches written', report?.volume?.matches_total ?? 0);
  pair('Matched', report?.volume?.matched ?? 0);
  pair('Needs attention', report?.volume?.needs_attention ?? 0);
  pair('Exports in range', report?.exports?.total ?? 0);
  lines.push('');

  const header = [
    'Company', 'Account', 'Period', 'Status', 'Cheques', 'Matches',
    'Needs attention', 'Approved at', 'Completed at',
  ];
  lines.push(header.map(csvCell).join(','));
  for (const r of (report?.rows || []) as any[]) {
    lines.push(
      [
        r.company_name || r.realm_id,
        r.account_name || r.account_id || '',
        r.period_label || `${r.period_start} to ${r.period_end}`,
        r.status,
        r.counts?.checks_total ?? 0,
        r.counts?.matches_total ?? 0,
        r.counts?.needs_attention ?? 0,
        r.approved_at || '',
        r.completed_at || '',
      ].map(csvCell).join(',')
    );
  }
  return lines.join('\r\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const wantsCsv = String(req.query.format || '').toLowerCase() === 'csv';

  // Two capabilities, one endpoint: reading the report and taking it away are
  // separately named in lib/roles.ts, and both are Administrator-only.
  const ctx = await requireCapability(req, res, wantsCsv ? 'reports.export' : 'reports.view');
  if (!ctx) return;

  const fallback = monthWindow();
  const from = isIsoDate(req.query.from) ? String(req.query.from) : fallback.from;
  const to = isIsoDate(req.query.to) ? String(req.query.to) : fallback.to;
  if (to < from) {
    return res.status(400).json({
      error: 'invalid_range',
      message: '`to` must not precede `from`.',
    });
  }

  const realmId = cleanText(req.query.realm_id, 64);
  const account = cleanText(req.query.account, 200);
  const batchId = cleanText(req.query.batch_id, 64);

  const { data, error } = await ctx.supabase.rpc('report_summary', {
    p_tenant_id: ctx.tenantId,
    p_from: from,
    p_to: to,
    p_realm_id: realmId,
    p_account: account,
    p_batch_id: batchId,
    p_row_limit: wantsCsv ? 200 : 50,
  });

  if (error) {
    if (isMissingObject(error)) {
      return res.status(503).json({
        error: 'migration_not_applied',
        message:
          'public.report_summary() is missing — apply ' +
          'supabase/migrations/035_history_reports_and_retention.sql.',
      });
    }
    return res.status(500).json({ error: 'report_failed', message: error.message });
  }
  // Assert on the parsed value, never on the absence of an error: an RPC that
  // RLS emptied comes back as null and must not render as a zeroed report.
  if (!data || typeof data !== 'object') {
    return res.status(500).json({
      error: 'report_failed',
      message: 'report_summary() returned no object.',
    });
  }

  if (!wantsCsv) {
    return res.status(200).json({ report: data });
  }

  const name = `kyriq-report-${from}-to-${to}.csv`;

  // Reuse the export surface that already exists rather than inventing a second
  // one: the download is recorded in export_history, which is what the Reports
  // "Exports" figure counts. Service client because that table's SELECT is
  // Administrator-only under migration 030 and the insert must not depend on a
  // policy that may not be applied; the tenant is pinned explicitly.
  try {
    const svc = createServiceClient();
    const { error: logErr } = await svc.from('export_history').insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      export_format: 'csv',
      check_count: Number((data as any)?.volume?.checks_total || 0),
      file_name: name,
      status: 'complete',
      completed_at: new Date().toISOString(),
      metadata: { kind: 'report', from, to, realm_id: realmId, account, batch_id: batchId },
    });
    if (logErr) console.error('[reports] export_history insert failed:', logErr.message);
  } catch (err: any) {
    console.error('[reports] export_history insert threw:', err?.message);
  }

  await auditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: 'report.exported',
    entityType: 'report',
    entityId: batchId || null,
    newValues: { from, to, realm_id: realmId, account, format: 'csv' },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.status(200).send(toCsv(data));
}
