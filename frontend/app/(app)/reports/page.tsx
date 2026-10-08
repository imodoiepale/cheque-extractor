'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Lock } from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  Input,
  KpiTile,
  Select,
  Skeleton,
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
import {
  downloadReportCsv,
  loadMyRole,
  loadReport,
  type DataFailure,
  type ReportSummary,
} from '@/lib/history-client';

/**
 * Reports — date, company and account filters (CHECKLIST section 13).
 *
 * ADMINISTRATOR ONLY. The gate is GET /api/reports/summary, which checks
 * `reports.view` (Administrator-only in lib/roles.ts) and answers 403 to a
 * plain User. That 403 is the acceptance test; hiding this page from the nav
 * would not be. This component renders the 403 it gets rather than pretending
 * the figures are zero.
 *
 * Every number on this page is counted out of rows that already exist —
 * batches, checks, matches, usage_ledger (027) and export_history (001) — by
 * public.report_summary() in migration 035. The `sources` block says which of
 * those tables the database actually has, so an unavailable figure reads as
 * unavailable and not as zero.
 */

function monthWindow(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const SOURCE_LABELS: Record<string, string> = {
  batches: 'reconciliation batches',
  checks: 'extracted cheques',
  matches: 'match results',
  usage_ledger: 'processed-cheque ledger',
  export_history: 'export history',
};

export default function ReportsPage() {
  const initial = useRef(monthWindow()).current;
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [realmId, setRealmId] = useState('');
  const [account, setAccount] = useState('');
  const [applied, setApplied] = useState({ from: initial.from, to: initial.to, realmId: '', account: '' });

  const [report, setReport] = useState<ReportSummary | null>(null);
  const [companies, setCompanies] = useState<{ realm_id: string; company_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DataFailure | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    loadMyRole().then((r) => setRole(r));
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const result = await loadReport({
      from: applied.from,
      to: applied.to,
      realmId: applied.realmId || null,
      account: applied.account || null,
    });
    if (result.kind !== 'report') {
      setFailure(result);
      setReport(null);
      setLoading(false);
      return;
    }
    setFailure(null);
    setReport(result.report);
    // The company options come from an UNFILTERED load, so choosing one company
    // does not shrink the list down to that company and trap the reader.
    if (!applied.realmId) {
      setCompanies(
        result.report.companies.map((c) => ({ realm_id: c.realm_id, company_name: c.company_name }))
      );
    }
    setLoading(false);
  }, [applied]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const rangeInvalid = to < from;

  const apply = () => {
    if (rangeInvalid) return;
    setApplied({ from, to, realmId, account: account.trim() });
  };

  const reset = () => {
    setFrom(initial.from);
    setTo(initial.to);
    setRealmId('');
    setAccount('');
    setApplied({ from: initial.from, to: initial.to, realmId: '', account: '' });
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    const err = await downloadReportCsv({
      from: applied.from,
      to: applied.to,
      realmId: applied.realmId || null,
      account: applied.account || null,
    });
    if (err) setExportError(err.message);
    setExporting(false);
  };

  const missingSources = report
    ? Object.entries(report.sources)
        .filter(([, present]) => !present)
        .map(([key]) => SOURCE_LABELS[key] || key)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-5" data-tone="calm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink-strong">Reports</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            Reconciliation and cheque volume for a date range, company and account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="outline" size="sm">
            Administrators only
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download size={13} />}
            loading={exporting}
            disabled={!report || !!failure}
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <GlassCard padding="md">
        <GlassCardTitle className="text-base">Filters</GlassCardTitle>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From" htmlFor="report-from">
            <Input
              id="report-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field
            label="To"
            htmlFor="report-to"
            error={rangeInvalid ? 'The end date cannot precede the start date.' : undefined}
          >
            <Input
              id="report-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Company" htmlFor="report-company">
            <Select
              id="report-company"
              value={realmId}
              onChange={(e) => setRealmId(e.target.value)}
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.realm_id} value={c.realm_id}>
                  {c.company_name || c.realm_id}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Account"
            htmlFor="report-account"
            hint="Bank account name or id, as recorded on the reconciliation."
          >
            <Input
              id="report-account"
              value={account}
              placeholder="All accounts"
              onChange={(e) => setAccount(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={apply} disabled={rangeInvalid || loading}>
            Apply
          </Button>
          {/* `link`, not `ghost`: ghost carries its own backdrop-blur and this
              sits inside a GlassCard — two blurred surfaces must not nest. */}
          <Button size="sm" variant="link" onClick={reset} disabled={loading}>
            Reset to this month
          </Button>
        </div>
      </GlassCard>

      {failure ? (
        <GlassCard padding="md">
          <div className="flex items-start gap-3">
            {failure.kind === 'forbidden' ? (
              <Lock size={18} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
            ) : (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            )}
            <div>
              <GlassCardTitle className="text-base">
                {failure.kind === 'forbidden'
                  ? 'Reports are for Administrators'
                  : failure.kind === 'migration_not_applied'
                    ? 'Reports are not available yet'
                    : 'The report could not be loaded'}
              </GlassCardTitle>
              <p role="alert" className="mt-1 text-sm text-ink-body">
                {failure.message}
              </p>
              {failure.kind === 'forbidden' ? (
                <p className="mt-2 text-xs text-ink-faint">
                  Your account{role ? ` (${role})` : ''} can run reconciliations and read
                  History. Ask a firm Administrator for reports and exports.
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

      {/* ── Figures ───────────────────────────────────────────── */}
      {!failure ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Cheques processed"
              value={report?.cheques_processed.count ?? 0}
              caption="usage ledger, by date processed"
              loading={loading}
            />
            <KpiTile
              label="Reconciliations"
              value={report?.batches.total ?? 0}
              caption={`${report?.batches.complete ?? 0} completed · ${report?.batches.abandoned ?? 0} abandoned`}
              loading={loading}
            />
            <KpiTile
              label="Cheques reconciled"
              value={report?.volume.checks_total ?? 0}
              caption={`${report?.volume.matched ?? 0} matched`}
              tone="brand"
              loading={loading}
            />
            <KpiTile
              label="Needs attention"
              value={report?.volume.needs_attention ?? 0}
              caption="still unresolved in range"
              tone={report && report.volume.needs_attention > 0 ? 'warning' : 'neutral'}
              loading={loading}
            />
          </div>

          {/* Where each figure comes from, in the page rather than in a doc. A
              reader should never have to guess whether a number is real. */}
          <GlassPanel tone="plain" radius="tile" padding="sm">
            <p className="text-xs text-ink-faint">
              <span className="font-semibold text-ink-body">How these are counted.</span>{' '}
              Cheques processed is one row per successfully processed cheque in the usage ledger,
              by the date it was processed
              {report && !report.cheques_processed.account_filter_applied
                ? ' — the ledger records the company but not the bank account, so the account filter does not narrow this figure'
                : ''}
              . Reconciliations, cheques reconciled, matched and needs-attention are counted over
              the batches whose period overlaps the range, which is what &ldquo;August&rdquo; means
              on a reconciliation rather than &ldquo;touched in August&rdquo;. Exports are counted
              from export history by date only{' '}
              {report?.exports.scope ? `(${report.exports.scope})` : ''}.
            </p>
          </GlassPanel>

          {missingSources.length > 0 ? (
            <p className="rounded-card border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text">
              Not every figure above is available on this database: {missingSources.join(', ')}{' '}
              {missingSources.length === 1 ? 'is' : 'are'} missing, so the corresponding numbers
              are reported as zero only because there is nothing to count yet.
            </p>
          ) : null}

          {/* ── Exports in range ───────────────────────────────── */}
          <GlassCard padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <GlassCardTitle className="text-base">Exports in range</GlassCardTitle>
              <span className="nums text-sm text-ink-body">{report?.exports.total ?? 0}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {loading ? (
                <Skeleton shape="text" className="w-48" />
              ) : Object.keys(report?.exports.by_format || {}).length === 0 ? (
                <p className="text-sm text-ink-body">No exports were taken in this range.</p>
              ) : (
                Object.entries(report!.exports.by_format).map(([fmt, n]) => (
                  <Badge key={fmt} tone="outline" size="sm">
                    <span className="uppercase">{fmt}</span>
                    <span className="nums">{n}</span>
                  </Badge>
                ))
              )}
            </div>
          </GlassCard>

          {/* ── Per-reconciliation detail ──────────────────────── */}
          <TableShell>
            {/* overflow-x-auto so the last columns stay reachable at phone
                width — TableShell clips, TableScroll scrolls. */}
            <TableScroll className="max-h-[60vh] overflow-x-auto">
              <Table className="min-w-[52rem]">
                <Thead>
                  <Tr>
                    <Th>Company &amp; account</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    <Th numeric>Cheques</Th>
                    <Th numeric>Matches</Th>
                    <Th numeric>Needs attention</Th>
                    <Th>Approved</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {loading ? (
                    [0, 1, 2].map((i) => (
                      <Tr key={i}>
                        {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                          <Td key={c}>
                            <Skeleton shape="text" className="w-full" />
                          </Td>
                        ))}
                      </Tr>
                    ))
                  ) : (report?.rows?.length ?? 0) === 0 ? (
                    <TableEmpty
                      colSpan={7}
                      title="Nothing in this range"
                      description="Widen the dates, or clear the company and account filters."
                    />
                  ) : (
                    report!.rows.map((r) => (
                      <Tr key={r.id}>
                        <Td>
                          <div className="font-medium text-ink-strong">
                            {r.company_name || r.realm_id}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-faint">
                            {r.account_name || r.account_id || 'No account recorded'}
                          </div>
                        </Td>
                        <Td>
                          <div className="text-ink-strong">
                            {r.period_label || `${r.period_start} – ${r.period_end}`}
                          </div>
                        </Td>
                        <Td className="capitalize">{r.status}</Td>
                        <Td numeric>{r.counts?.checks_total ?? 0}</Td>
                        <Td numeric>{r.counts?.matches_total ?? 0}</Td>
                        <Td numeric>{r.counts?.needs_attention ?? 0}</Td>
                        <Td muted>{r.approved_at ? r.approved_at.slice(0, 10) : '—'}</Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </TableScroll>
          </TableShell>

          {report && report.rows.length >= report.row_limit ? (
            <p className="text-xs text-ink-faint">
              The table lists the {report.row_limit} most recent reconciliations in range. The
              figures above are counted over all of them, not just the ones listed.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
