'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  History as HistoryIcon,
  Loader2,
} from 'lucide-react';
import {
  Badge,
  Button,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  Skeleton,
  StatusPill,
  Table,
  TableEmpty,
  TableScroll,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import type { StatusKey } from '@/components/ui';
import {
  downloadReportCsv,
  loadApprovers,
  loadHistory,
  loadMyRole,
  type ApproverMap,
  type DataFailure,
  type HistoryStatus,
} from '@/lib/history-client';
import type { BatchPayload } from '@/lib/batch-state';
import { cn } from '@/lib/utils';

/**
 * History — past reconciliations, with approver, status and export
 * (CHECKLIST section 13).
 *
 * It reads GET /api/batches, the endpoint migration 032 already shipped. There
 * is no second list endpoint, and the pagination is against that endpoint's own
 * total/limit/offset rather than fetching everything and slicing on the client.
 *
 * Two deliberate behaviours:
 *
 *  - An ABANDONED run is history too, and the default filter is "All". A firm
 *    that discarded a run needs to be able to see that it did.
 *  - A 503 from the endpoint is rendered as "not deployed yet", never as an
 *    empty table. Migration 032 has never been applied to any database, so 503
 *    is what this page actually gets today, and "no history" would be a lie.
 *
 * Glass lives on the container and the sticky header only — the rows are plain,
 * so the blurred-element count is fixed no matter how many runs there are.
 */

const PAGE_SIZE = 25;

/**
 * The row-level action, as a hairline pill rather than a Button.
 *
 * Button's `secondary` variant carries `glass-card`, and the table shell is
 * already a blurred surface — a Button in a row would be a blurred element
 * inside a blurred element, once per row. This is the same recipe the Export
 * page already uses for its per-row action: no backdrop-filter, and it keeps
 * the primitive's py-3 row height instead of a 44px button inflating it.
 */
const ROW_ACTION =
  'press inline-flex min-h-0 items-center gap-1 whitespace-nowrap rounded-full ' +
  'border border-glass-hairline bg-surface/70 px-3 py-1.5 text-xs font-semibold ' +
  'text-brand-deep hover:bg-brand/[0.08] focus-visible:outline-none ' +
  'focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:pointer-events-none disabled:opacity-disabled';

const STATUS_TABS: { key: HistoryStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'complete', label: 'Completed' },
  { key: 'open', label: 'In progress' },
  { key: 'abandoned', label: 'Abandoned' },
];

/* The status vocabulary is mapped once onto the shared StatusPill tones, never
   re-coloured here: 'open' is work in progress, 'abandoned' is inert. */
const STATUS_PILL: Record<string, { status: StatusKey; label: string }> = {
  complete: { status: 'complete', label: 'Completed' },
  open: { status: 'processing', label: 'In progress' },
  abandoned: { status: 'draft', label: 'Abandoned' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function approverLabel(batch: BatchPayload, approvers: ApproverMap): string {
  if (!batch.approved_by) return '—';
  const a = approvers[batch.approved_by];
  return a?.name || a?.email || 'A firm administrator';
}

export default function HistoryPage() {
  const [status, setStatus] = useState<HistoryStatus>('all');
  const [offset, setOffset] = useState(0);
  const [batches, setBatches] = useState<BatchPayload[]>([]);
  const [total, setTotal] = useState(0);
  const [approvers, setApprovers] = useState<ApproverMap>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DataFailure | null>(null);
  const [canExport, setCanExport] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    // Only to avoid rendering a control that would 403. The endpoint is the gate.
    loadMyRole().then((role) => setCanExport(role === 'administrator'));
  }, []);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const result = await loadHistory({ status, limit: PAGE_SIZE, offset });
    if (result.kind !== 'page') {
      setFailure(result);
      setBatches([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setFailure(null);
    setBatches(result.batches);
    setTotal(result.total);
    setLoading(false);

    const ids = result.batches.map((b) => b.approved_by).filter((v): v is string => !!v);
    if (ids.length > 0) setApprovers(await loadApprovers(ids));
  }, [status, offset]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const summary = useMemo(
    () => ({
      completed: batches.filter((b) => b.status === 'complete').length,
      open: batches.filter((b) => b.status === 'open').length,
      abandoned: batches.filter((b) => b.status === 'abandoned').length,
    }),
    [batches]
  );

  const exportBatch = async (batch: BatchPayload) => {
    setExporting(batch.id);
    setExportError(null);
    const err = await downloadReportCsv({
      from: batch.period_start,
      to: batch.period_end,
      realmId: batch.realm_id,
      batchId: batch.id,
    });
    if (err) setExportError(err.message);
    setExporting(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-5" data-tone="calm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink-strong">History</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            Every reconciliation this firm has run, with who approved it.
          </p>
        </div>
        {!loading && !failure && total > 0 ? (
          <p className="nums text-xs text-ink-faint">
            {pageStart}&ndash;{pageEnd} of {total}
            {summary.abandoned > 0 ? ` · ${summary.abandoned} abandoned on this page` : ''}
          </p>
        ) : null}
      </div>

      {/* Status filter. Plain buttons rather than Tabs: the selection drives a
          server query, not a panel swap. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(tab.key);
                setOffset(0);
              }}
              className={cn(
                'press rounded-pill border px-3.5 py-1.5 text-xs font-semibold',
                active
                  ? 'border-brand bg-brand/[0.08] text-brand-deep shadow-glass-selected'
                  : 'border-glass-hairline bg-surface/60 text-ink-body hover:bg-brand/[0.045]'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* A 503 is the honest "not deployed" answer, NOT an empty table. */}
      {failure ? (
        <GlassCard padding="md">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <div>
              <GlassCardTitle className="text-base">
                {failure.kind === 'migration_not_applied'
                  ? 'Reconciliation history is not available yet'
                  : 'History could not be loaded'}
              </GlassCardTitle>
              <p role="alert" className="mt-1 text-sm text-ink-body">
                {failure.message}
              </p>
              {failure.kind === 'migration_not_applied' ? (
                <p className="mt-2 text-xs text-ink-faint">
                  This is a deployment step, not an empty firm. Nothing has been lost — apply
                  the batches migration and past runs appear here.
                </p>
              ) : null}
            </div>
          </div>
        </GlassCard>
      ) : null}

      {exportError ? (
        <p
          role="alert"
          className="rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
        >
          {exportError}
        </p>
      ) : null}

      {!failure ? (
        <TableShell>
          {/* overflow-x-auto is load-bearing at phone width: the row actions sit
              in the last column, and without a horizontal scrollbar inside the
              shell they would be clipped out of reach by the shell's own
              overflow-hidden. */}
          <TableScroll className="max-h-[70vh] overflow-x-auto">
            <Table className="min-w-[56rem]">
              <Thead>
                <Tr>
                  <Th>Company &amp; account</Th>
                  <Th>Period</Th>
                  <Th>Status</Th>
                  <Th numeric>Cheques</Th>
                  <Th numeric>Needs attention</Th>
                  <Th>Approved by</Th>
                  <Th>Export</Th>
                </Tr>
              </Thead>
              <Tbody>
                {loading ? (
                  [0, 1, 2, 3].map((i) => (
                    <Tr key={i}>
                      {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                        <Td key={c}>
                          <Skeleton shape="text" className="w-full" />
                        </Td>
                      ))}
                    </Tr>
                  ))
                ) : batches.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    title="No reconciliations yet"
                    description={
                      status === 'all'
                        ? 'A run appears here as soon as one is started.'
                        : 'No runs with this status. Try “All”.'
                    }
                    action={
                      <Link href="/reconcile" className="text-sm font-semibold text-brand-deep">
                        Start a reconciliation
                      </Link>
                    }
                  />
                ) : (
                  batches.map((batch) => {
                    const pill = STATUS_PILL[batch.status] || {
                      status: 'idle' as StatusKey,
                      label: batch.status,
                    };
                    const counts = batch.state?.counts;
                    return (
                      <Tr key={batch.id}>
                        <Td>
                          <div className="font-medium text-ink-strong">
                            {batch.company_name || batch.realm_id}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-faint">
                            {batch.account_name || batch.account_id || 'No account recorded'}
                          </div>
                        </Td>
                        <Td>
                          <div className="text-ink-strong">{batch.summary?.period}</div>
                          <div className="nums mt-0.5 text-xs text-ink-faint">
                            {batch.period_start} &ndash; {batch.period_end}
                          </div>
                        </Td>
                        <Td>
                          <StatusPill status={pill.status} label={pill.label} size="sm" />
                          {batch.status !== 'complete' ? (
                            <div className="mt-1 text-xs text-ink-faint">
                              {batch.summary?.step_label}
                            </div>
                          ) : null}
                        </Td>
                        <Td numeric>{counts?.checks_total ?? 0}</Td>
                        <Td numeric>
                          {counts && counts.needs_attention > 0 ? (
                            <Badge tone="warning" size="sm">
                              <span className="nums">{counts.needs_attention}</span>
                            </Badge>
                          ) : (
                            <span className="text-ink-faint">0</span>
                          )}
                        </Td>
                        <Td>
                          <div className="text-ink-strong">{approverLabel(batch, approvers)}</div>
                          <div className="nums mt-0.5 text-xs text-ink-faint">
                            {batch.approved_at ? fmtDate(batch.approved_at) : 'Not approved'}
                          </div>
                        </Td>
                        <Td>
                          {canExport ? (
                            <button
                              type="button"
                              className={ROW_ACTION}
                              disabled={exporting === batch.id}
                              aria-busy={exporting === batch.id || undefined}
                              onClick={() => exportBatch(batch)}
                            >
                              {exporting === batch.id ? (
                                <Loader2 size={12} className="animate-spin" aria-hidden />
                              ) : (
                                <Download size={12} aria-hidden />
                              )}
                              CSV
                            </button>
                          ) : (
                            <span className="text-xs text-ink-faint">Administrators only</span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })
                )}
              </Tbody>
            </Table>
          </TableScroll>
        </TableShell>
      ) : null}

      {!failure && total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            variant="secondary"
            icon={<ChevronLeft size={14} />}
            disabled={!hasPrev || loading}
            onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
          >
            Previous
          </Button>
          <p className="nums text-xs text-ink-faint">
            {pageStart}&ndash;{pageEnd} of {total}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasNext || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
            <ChevronRight size={14} aria-hidden />
          </Button>
        </div>
      ) : null}

      <GlassPanel tone="plain" radius="tile" padding="sm">
        <p className="flex items-start gap-2 text-xs text-ink-faint">
          <HistoryIcon size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            Extracted cheque data and match results are kept for every run above, including
            abandoned ones. Uploaded source PDFs are deleted 14 days after a reconciliation is
            completed.
          </span>
        </p>
      </GlassPanel>
    </div>
  );
}
