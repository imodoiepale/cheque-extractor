import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, Eye, CheckCircle, Loader2, Trash2 } from 'lucide-react';
import {
  Badge,
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
  type StatusKey,
} from '@/components/ui';
import { ComparisonRow, SortField, SortDirection, formatCurrency, formatDate, parseAmount, DateFormat } from '../utils/comparisonUtils';
import { VisibleColumns } from '../hooks/useComparisonState';

/**
 * The comparison grid. This table IS the product, so the rules it is held to
 * are stricter than anywhere else in the app:
 *
 * 1. Glass is on the SHELL and the STICKY HEADER only — never on a row. Rows
 *    are plain `<Tr>`, which carries background-colour transitions and no
 *    backdrop-filter, so the number of composited blur layers on this page is
 *    a constant and does NOT grow with the row count.
 * 2. Density does not regress. `DENSE_GRID` below restores the pre-redesign
 *    22px row height in exactly ONE place, because the shared `tdVariants`
 *    py-3/text-sm recipe is tuned for the app's other, sparser tables and
 *    would roughly halve the rows on screen here. Everything else (the single
 *    <th> recipe, the hairlines, the tokens) comes from the primitive.
 * 3. No Excel look: no per-cell vertical rules, no zebra striping, no
 *    navy-on-white header blocks. Section boundaries are three hairlines, not
 *    fifteen; state is a tinted row plus one pill.
 */

/* The ONE place this grid's row metrics are declared. Pinned to the
   pre-redesign 22px so no accountant loses a row of the 200-record view; the
   type is 11px rather than the old 10px, which fits inside the same 22px and
   is the only thing here that got bigger. */
const DENSE_GRID = [
  'text-[11px]',
  '[&_tbody_tr]:h-[22px]',
  '[&_td]:px-1.5 [&_td]:py-0.5',
  '[&_th]:px-1.5 [&_th]:py-1.5',
].join(' ');

/** Vertical hairline that opens a column group. Three per row, not fifteen. */
const GROUP_EDGE = 'border-l border-glass-hairline';

/** Section header cell: the grouped top row, tinted rather than painted navy. */
const SECTION = 'text-center text-eyebrow text-ink-body bg-brand/[0.06]';

interface ComparisonTableProps {
  data: ComparisonRow[];
  sortField: SortField;
  sortDirection: SortDirection;
  visibleColumns: VisibleColumns;
  dateFormat: DateFormat;
  onSort: (field: SortField) => void;
  onRowClick: (row: ComparisonRow) => void;
  currentPage: number;
  itemsPerPage: number;
  onVouch: (row: ComparisonRow) => void;
  onUnvouch: (row: ComparisonRow) => void;
  vouchingId: string | null;
  onDeleteQBEntry?: (entryId: string) => void;
  deletingQBEntry?: string | null;
  /** Rendered inside the table's glass shell, below the scroll region, so the
   *  pagination bar does not become a second stacked surface. */
  footer?: React.ReactNode;
}

const SortIcon: React.FC<{ field: SortField; sortField: SortField; sortDirection: SortDirection }> = ({
  field,
  sortField,
  sortDirection,
}) => (
  <span className="ml-1 inline-flex flex-col leading-none" aria-hidden>
    <ChevronUp
      className={`h-2.5 w-2.5 ${sortField === field && sortDirection === 'asc' ? 'text-brand-deep' : 'text-ink-faint/40'}`}
    />
    <ChevronDown
      className={`-mt-0.5 h-2.5 w-2.5 ${sortField === field && sortDirection === 'desc' ? 'text-brand-deep' : 'text-ink-faint/40'}`}
    />
  </span>
);

/**
 * Match status reuses the shared status vocabulary rather than inventing
 * colours: `StatusPill` maps each key to one tone once, app-wide, so
 * "Mismatch" can never be amber here and red somewhere else. The label is
 * always spelled out — status is never colour alone.
 */
const MATCH_STATUS: Record<
  ComparisonRow['matchStatus'],
  { status: StatusKey; label: string; row: 'success' | 'warning' | 'error' | 'none'; accent: string }
> = {
  matched: { status: 'matched', label: 'Matched', row: 'success', accent: 'var(--success)' },
  mismatch: { status: 'review', label: 'Mismatch', row: 'warning', accent: 'var(--warning)' },
  'missing-in-qb': { status: 'processing', label: 'Missing in QB', row: 'none', accent: 'var(--brand)' },
  'missing-in-extraction': { status: 'failed', label: 'Missing in Checks', row: 'error', accent: 'var(--error)' },
};

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  data,
  sortField,
  sortDirection,
  dateFormat,
  onSort,
  onRowClick,
  currentPage,
  itemsPerPage,
  onVouch,
  onUnvouch,
  vouchingId,
  onDeleteQBEntry,
  deletingQBEntry,
  footer,
}) => {
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return data.slice(startIndex, startIndex + itemsPerPage);
  }, [data, currentPage, itemsPerPage]);

  const totals = useMemo(() => {
    const checksTotal = data.reduce(
      (sum, row) => (row.extractionData ? sum + parseAmount(row.amount) : sum),
      0
    );
    const qbTotal = data.reduce(
      (sum, row) => (row.qbData ? sum + parseAmount(row.qbData.amount) : sum),
      0
    );
    return { count: data.length, checksTotal, qbTotal, difference: checksTotal - qbTotal };
  }, [data]);

  return (
    /* One blurred shell. The scroll region inside it is the page's only table
       scrollbar; the page itself does not scroll on top of it. */
    <TableShell className="flex min-h-0 flex-1 flex-col">
      {/* min-h-0 is load-bearing: a flex item defaults to min-height:auto,
          so without it the scroll region refuses to shrink below its content
          and the pagination bar gets clipped off the bottom of the page. */}
      <TableScroll className="min-h-0 max-h-[60vh] flex-1 md:max-h-none">
        <Table className={DENSE_GRID}>
          {/* The only glass inside the table: sticky, blurred, one layer. */}
          <Thead>
            <tr>
              <Th rowSpan={2} className={`${SECTION} align-middle`}>
                #
              </Th>
              <Th colSpan={5} className={`${SECTION} ${GROUP_EDGE}`}>
                Check Extraction
              </Th>
              <Th colSpan={6} className={`${SECTION} ${GROUP_EDGE}`}>
                QuickBooks
              </Th>
              <Th colSpan={3} className={`${SECTION} ${GROUP_EDGE}`}>
                Comparison
              </Th>
              <Th rowSpan={2} className={`${SECTION} ${GROUP_EDGE} align-middle`}>
                View
              </Th>
            </tr>
            <tr>
              {/* Check extraction */}
              <Th sortable onClick={() => onSort('checkNumber')} className={GROUP_EDGE}>
                Check #
                <SortIcon field="checkNumber" sortField={sortField} sortDirection={sortDirection} />
              </Th>
              <Th sortable onClick={() => onSort('date')}>
                Date
                <SortIcon field="date" sortField={sortField} sortDirection={sortDirection} />
              </Th>
              <Th numeric sortable onClick={() => onSort('amount')}>
                Amount
                <SortIcon field="amount" sortField={sortField} sortDirection={sortDirection} />
              </Th>
              <Th sortable onClick={() => onSort('payee')}>
                Payee
                <SortIcon field="payee" sortField={sortField} sortDirection={sortDirection} />
              </Th>
              <Th>Bank</Th>

              {/* QuickBooks */}
              <Th className={GROUP_EDGE}>Check #</Th>
              <Th>Date</Th>
              <Th numeric>Amount</Th>
              <Th>Payee</Th>
              <Th>Account</Th>
              <Th>Source</Th>

              {/* Comparison */}
              <Th sortable onClick={() => onSort('matchStatus')} className={`${GROUP_EDGE} text-center`}>
                Status
                <SortIcon field="matchStatus" sortField={sortField} sortDirection={sortDirection} />
              </Th>
              <Th numeric>Conf %</Th>
              <Th>Issue</Th>
            </tr>
          </Thead>

          <Tbody>
            {paginatedData.length === 0 ? (
              <TableEmpty
                colSpan={16}
                title="No matching records"
                description="Adjust the filters, or sync QuickBooks data to compare against."
              />
            ) : (
              paginatedData.map((row, idx) => {
                const match = MATCH_STATUS[row.matchStatus];
                const hasRealIssue = row.hasIssue && (row.isDuplicate || row.matchStatus === 'mismatch');
                const state = hasRealIssue ? 'error' : match.row;
                const hasExtraction = Boolean(row.extractionData) || row.source === 'matched';
                const hasQb = Boolean(row.qbData) || row.source === 'matched';

                return (
                  <Tr
                    key={row.id}
                    interactive
                    state={state}
                    onClick={() => onRowClick(row)}
                  >
                    {/* State accent is an inset shadow on the index cell, not a
                        border-width change: geometry must never move. */}
                    <Td
                      numeric
                      className="text-center font-semibold text-ink-faint"
                      style={{ boxShadow: `inset 3px 0 0 0 hsl(${match.accent})` }}
                    >
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </Td>

                    {/* Check extraction */}
                    <Td className={`${GROUP_EDGE} nums font-semibold`}>
                      {hasExtraction ? row.checkNumber || '—' : '—'}
                    </Td>
                    <Td muted className="nums">
                      {hasExtraction && row.date ? formatDate(row.date, dateFormat) : '—'}
                    </Td>
                    <Td className="nums-money font-semibold text-success-text">
                      {hasExtraction && row.amount ? formatCurrency(row.amount) : '—'}
                    </Td>
                    <Td className="max-w-[120px] truncate">
                      {hasExtraction ? row.payee || '—' : '—'}
                    </Td>
                    <Td muted className="max-w-[100px] truncate">
                      {hasExtraction ? row.bankAccount || '—' : '—'}
                    </Td>

                    {/* QuickBooks */}
                    <Td className={`${GROUP_EDGE} nums font-semibold`}>
                      {hasQb ? row.qbData?.checkNumber || row.checkNumber || '—' : '—'}
                    </Td>
                    <Td muted className="nums">
                      {hasQb && (row.qbData?.date || row.date)
                        ? formatDate(row.qbData?.date || row.date, dateFormat)
                        : '—'}
                    </Td>
                    <Td className="nums-money font-semibold text-success-text">
                      {hasQb && (row.qbData?.amount || row.amount)
                        ? formatCurrency(row.qbData?.amount || row.amount)
                        : '—'}
                    </Td>
                    <Td className="max-w-[120px] truncate">
                      {hasQb ? row.qbData?.payee || row.payee || '—' : '—'}
                    </Td>
                    <Td muted className="max-w-[100px] truncate">
                      {hasQb ? row.qbData?.account || row.bankAccount || '—' : '—'}
                    </Td>
                    <Td className="text-center">
                      {row.qbData ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge
                            size="sm"
                            tone={
                              row.qbData.qbSource === 'qbo_file_upload'
                                ? 'brand'
                                : row.qbData.qbSource?.includes('cheque')
                                  ? 'success'
                                  : 'neutral'
                            }
                          >
                            {row.qbData.qbSource === 'qbo_file_upload'
                              ? 'File'
                              : row.qbData.qbSource?.includes('cheque')
                                ? 'QB API'
                                : row.qbData.qbSource || 'Unknown'}
                          </Badge>
                          {onDeleteQBEntry && row.qbData.id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteQBEntry(row.qbData!.id);
                              }}
                              disabled={deletingQBEntry === row.qbData.id}
                              className="press rounded-full p-0.5 text-error-text hover:bg-error-bg disabled:opacity-disabled"
                              title="Delete this QB entry"
                            >
                              {deletingQBEntry === row.qbData.id ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <Trash2 size={10} />
                              )}
                            </button>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>

                    {/* Comparison */}
                    <Td className={`${GROUP_EDGE} text-center`}>
                      <StatusPill size="sm" status={match.status} label={match.label} />
                    </Td>
                    <Td numeric className="font-semibold">
                      {row.confidence !== undefined ? (
                        <span
                          className={
                            row.confidence >= 80
                              ? 'text-success-text'
                              : row.confidence >= 60
                                ? 'text-warning-text'
                                : 'text-error-text'
                          }
                        >
                          {row.confidence}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>

                    {/* Issue — vouch / unvouch live here and both stay. */}
                    <Td className="max-w-[180px]">
                      {row.vouched ? (
                        <span className="flex items-center gap-1">
                          <span className="flex items-center gap-0.5 font-semibold text-success-text">
                            <CheckCircle size={10} />
                            Vouched
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnvouch(row);
                            }}
                            disabled={vouchingId === row.id}
                            className="text-[10px] font-medium text-error-text underline hover:no-underline disabled:opacity-disabled"
                            title="Remove vouch"
                          >
                            {vouchingId === row.id ? (
                              <Loader2 size={8} className="animate-spin" />
                            ) : (
                              'Unvouch'
                            )}
                          </button>
                        </span>
                      ) : row.issues && row.issues.length > 0 ? (
                        <span className="flex items-start justify-between gap-1">
                          <span className="min-w-0 flex-1">
                            {row.issues.slice(0, 2).map((issue, i) => (
                              <span
                                key={i}
                                className="block truncate leading-tight text-error-text"
                                title={issue}
                              >
                                {row.isDuplicate && i === 0 ? '⚠ ' : '• '}
                                {issue}
                              </span>
                            ))}
                            {row.issues.length > 2 && (
                              <span className="block text-[10px] text-error-text/80">
                                +{row.issues.length - 2} more
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onVouch(row);
                            }}
                            disabled={vouchingId === row.id}
                            className="press shrink-0 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-semibold text-success-foreground hover:bg-success-dark disabled:opacity-disabled"
                            title="Mark this issue as acceptable/resolved"
                          >
                            {vouchingId === row.id ? (
                              <Loader2 size={8} className="animate-spin" />
                            ) : (
                              'Vouch'
                            )}
                          </button>
                        </span>
                      ) : (
                        <span className="text-success-text">✓</span>
                      )}
                    </Td>

                    {/* Actions */}
                    <Td className={`${GROUP_EDGE} text-center`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(row);
                        }}
                        className="press rounded-full p-0.5 text-ink-faint hover:bg-brand/10 hover:text-brand-deep"
                        title="View details"
                      >
                        <Eye size={12} />
                      </button>
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>

          {/* Sticky totals. Deliberately NOT glass: a second blurred sticky
              band inside a blurred shell is a third composited layer for no
              visual gain, so this is an opaque surface with a hairline. */}
          <tfoot className="sticky bottom-0 z-10 bg-surface/95 font-semibold text-ink-strong">
            <tr className="h-[24px]">
              <Td className="border-t border-glass-hairline text-center">Σ</Td>
              <Td colSpan={2} className={`${GROUP_EDGE} border-t border-glass-hairline`}>
                Total: <span className="nums">{totals.count}</span>
              </Td>
              <Td className="nums-money border-t border-glass-hairline text-success-text">
                {formatCurrency(totals.checksTotal)}
              </Td>
              <Td colSpan={2} className="border-t border-glass-hairline" />
              <Td colSpan={2} className={`${GROUP_EDGE} border-t border-glass-hairline`} />
              <Td className="nums-money border-t border-glass-hairline text-success-text">
                {formatCurrency(totals.qbTotal)}
              </Td>
              <Td colSpan={2} className="border-t border-glass-hairline" />
              <Td className={`${GROUP_EDGE} nums-money border-t border-glass-hairline text-center`}>
                <span className={totals.difference === 0 ? 'text-success-text' : 'text-error-text'}>
                  Δ {formatCurrency(Math.abs(totals.difference))}
                </span>
              </Td>
              <Td colSpan={2} className="border-t border-glass-hairline" />
              <Td colSpan={2} className={`${GROUP_EDGE} border-t border-glass-hairline`} />
            </tr>
          </tfoot>
        </Table>
      </TableScroll>
      {footer}
    </TableShell>
  );
};
