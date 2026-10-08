'use client';

import { createClient } from '@/lib/supabase/client';
import { productRole, type ProductRole } from '@/lib/roles';
import type { BatchPayload } from '@/lib/batch-state';

/**
 * The browser side of History and Reports (CHECKLIST section 13).
 *
 * Two rules, both of which exist because the failure they prevent LOOKS fine:
 *
 *  1. A 503 `migration_not_applied` is reported as "not deployed", never as an
 *     empty list. Migrations 026-035 have never been applied to any database,
 *     so 503 is the response this code actually gets today. Rendering it as
 *     zero rows would tell a firm it has no reconciliation history, which is a
 *     different and much worse statement than "this is not live yet".
 *  2. History does NOT get a list endpoint of its own. It reads
 *     GET /api/batches, which already exists (migration 032), and paginates
 *     against that endpoint's own total/limit/offset.
 *
 * Hiding the Reports controls from a User is a courtesy, not the gate: the
 * endpoints check `reports.view` / `reports.export` server-side and answer 403.
 */

export type DataFailure =
  | { kind: 'migration_not_applied'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'error'; message: string };

export interface HistoryPage {
  kind: 'page';
  batches: BatchPayload[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReportResult {
  kind: 'report';
  report: ReportSummary;
}

/** Exactly what public.report_summary() returns. */
export interface ReportSummary {
  range: { from: string; to: string };
  filters: { realm_id: string | null; account: string | null; batch_id: string | null };
  /** Which tables the database actually has. A missing one is never zeroed. */
  sources: {
    batches: boolean;
    checks: boolean;
    matches: boolean;
    usage_ledger: boolean;
    export_history: boolean;
  };
  batches: { total: number; complete: number; open: number; abandoned: number; approved: number };
  volume: {
    checks_total: number;
    matches_total: number;
    matched: number;
    approved: number;
    rejected: number;
    needs_attention: number;
  };
  cheques_processed: { count: number; source: string; account_filter_applied: boolean };
  exports: { total: number; by_format: Record<string, number>; scope: string };
  companies: { realm_id: string; company_name: string | null; batches: number }[];
  rows: ReportRow[];
  row_limit: number;
}

export interface ReportRow {
  id: string;
  realm_id: string;
  company_name: string | null;
  account_id: string | null;
  account_name: string | null;
  period_label: string | null;
  period_start: string;
  period_end: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  counts: {
    checks_total?: number;
    matches_total?: number;
    needs_attention?: number;
    approved?: number;
  } | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Map a non-2xx body onto the one failure shape. Never throws. */
function toFailure(status: number, body: any): DataFailure {
  const message = body?.message || body?.error || `Request failed (${status}).`;
  if (status === 503 || body?.error === 'migration_not_applied') {
    return {
      kind: 'migration_not_applied',
      message:
        body?.message ||
        'This is not available yet — the migration behind it has not been applied to this database.',
    };
  }
  if (status === 403) return { kind: 'forbidden', message };
  if (status === 401) return { kind: 'unauthenticated', message };
  return { kind: 'error', message };
}

async function getJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: await authHeaders() });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export type HistoryStatus = 'all' | 'open' | 'complete' | 'abandoned';

/**
 * GET /api/batches — History's list. The committed endpoint, not a new one.
 *
 * `status: 'all'` is the default on purpose: an abandoned run is history too
 * and is not hidden.
 */
export async function loadHistory(params: {
  status?: HistoryStatus;
  realmId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<HistoryPage | DataFailure> {
  const q = new URLSearchParams();
  q.set('status', params.status || 'all');
  if (params.realmId) q.set('realm_id', params.realmId);
  q.set('limit', String(params.limit ?? 25));
  q.set('offset', String(params.offset ?? 0));

  try {
    const { status, body } = await getJson(`/api/batches?${q.toString()}`);
    if (status !== 200 || !Array.isArray(body?.batches)) return toFailure(status, body);
    return {
      kind: 'page',
      batches: body.batches as BatchPayload[],
      total: Number(body.total ?? body.batches.length),
      limit: Number(body.limit ?? params.limit ?? 25),
      offset: Number(body.offset ?? params.offset ?? 0),
    };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

export type ApproverMap = Record<string, { name: string | null; email: string | null }>;

/**
 * GET /api/history/approvers — uuid -> name for the approver column.
 *
 * Best-effort on purpose: a failure here costs the NAME, so the column falls
 * back to the approval timestamp rather than blanking the whole page.
 */
export async function loadApprovers(ids: string[]): Promise<ApproverMap> {
  const unique = Array.from(new Set(ids.filter(Boolean))).slice(0, 100);
  if (unique.length === 0) return {};
  try {
    const { status, body } = await getJson(
      `/api/history/approvers?ids=${encodeURIComponent(unique.join(','))}`
    );
    if (status !== 200 || !body?.approvers) return {};
    return body.approvers as ApproverMap;
  } catch {
    return {};
  }
}

export interface ReportFilters {
  from: string;
  to: string;
  realmId?: string | null;
  account?: string | null;
  batchId?: string | null;
}

export function reportQuery(f: ReportFilters): URLSearchParams {
  const q = new URLSearchParams();
  q.set('from', f.from);
  q.set('to', f.to);
  if (f.realmId) q.set('realm_id', f.realmId);
  if (f.account) q.set('account', f.account);
  if (f.batchId) q.set('batch_id', f.batchId);
  return q;
}

/** GET /api/reports/summary — Administrator only, enforced server-side. */
export async function loadReport(f: ReportFilters): Promise<ReportResult | DataFailure> {
  try {
    const { status, body } = await getJson(`/api/reports/summary?${reportQuery(f).toString()}`);
    if (status !== 200 || !body?.report) return toFailure(status, body);
    return { kind: 'report', report: body.report as ReportSummary };
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

/**
 * Download the CSV. A bearer token is required, so this fetches and hands the
 * browser a blob rather than pointing an anchor at the endpoint — an anchor
 * carries no Authorization header and would 401.
 */
export async function downloadReportCsv(f: ReportFilters): Promise<DataFailure | null> {
  try {
    const q = reportQuery(f);
    q.set('format', 'csv');
    const res = await fetch(`/api/reports/summary?${q.toString()}`, {
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return toFailure(res.status, body);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyriq-report-${f.from}-to-${f.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return null;
  } catch (err: any) {
    return { kind: 'error', message: err?.message || 'Could not reach Kyriq.' };
  }
}

/**
 * The caller's own product role.
 *
 * user_profiles SELECT is restricted to `id = auth.uid()` (migration 010), so
 * this reads exactly one row — the caller's own — and cannot be used to probe
 * anyone else. Used only to avoid rendering a control that would 403; the
 * endpoints are the gate.
 */
export async function loadMyRole(): Promise<ProductRole | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    return productRole(data?.role);
  } catch {
    return null;
  }
}
