import React, { useEffect, useRef, useState } from 'react';
import { Search, Upload, Download, ChevronDown, RefreshCw, X, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { Badge, Button, Input, Select } from '@/components/ui';
import { useSpelling } from '@/hooks/useSpelling';

/**
 * Filter + action chrome for the grid. ONE row.
 *
 * Search, the match-status filter and the actions stay visible; date range,
 * document, QB account and QB source live in the "Filters" popover, which
 * carries a count so nothing filtering the grid is ever invisible. That halves
 * this bar's height, and rows on screen are the one thing this page cannot
 * spend.
 *
 * The popovers are deliberately OPAQUE (`bg-surface`, no backdrop-filter): a
 * blurred popover over a blurred card double-composites and both go muddy
 * (rule 2).
 */

/** Popover surface shared by the filters and export menus. */
const POPOVER =
  'absolute top-full z-50 mt-1 overflow-hidden rounded-input border border-glass-hairline bg-surface shadow-glass-modal animate-popover-in';

const POPOVER_ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink-body transition-colors duration-tap hover:bg-brand/[0.06] hover:text-ink-strong';

interface ComparisonControlsBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  selectedQBSource: string;
  setSelectedQBSource: (source: string) => void;
  qbSources: string[];
  selectedPdfName: string;
  setSelectedPdfName: (name: string) => void;
  pdfNames: string[];
  selectedAccount: string;
  setSelectedAccount: (account: string) => void;
  accountNames: string[];
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  showExportDropdown: boolean;
  setShowExportDropdown: (show: boolean) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  onUpload: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  showIssuesOnly: boolean;
  setShowIssuesOnly: (show: boolean) => void;
  issueCount: number;
  /** Status tabs with counts; they replace the status select. */
  statusTabs?: React.ReactNode;
}

export const ComparisonControlsBar: React.FC<ComparisonControlsBarProps> = ({
  searchQuery,
  setSearchQuery,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  selectedQBSource,
  setSelectedQBSource,
  qbSources,
  selectedPdfName,
  setSelectedPdfName,
  pdfNames,
  selectedAccount,
  setSelectedAccount,
  accountNames,
  filterStatus,
  setFilterStatus,
  showExportDropdown,
  setShowExportDropdown,
  onRefresh,
  refreshing = false,
  onUpload,
  onExportCSV,
  onExportExcel,
  onResetFilters,
  hasActiveFilters,
  showIssuesOnly,
  setShowIssuesOnly,
  issueCount,
  statusTabs,
}) => {
  const t = useSpelling();
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

  /** Only the filters hidden inside the popover count towards its badge. */
  const hiddenFilterCount =
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0) +
    (selectedPdfName !== 'all' ? 1 : 0) +
    (selectedAccount !== 'all' ? 1 : 0) +
    (selectedQBSource !== 'all' ? 1 : 0);

  useEffect(() => {
    if (!showFilters) return;
    const onDown = (e: MouseEvent) => {
      if (!filtersRef.current?.contains(e.target as Node)) setShowFilters(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showFilters]);

  return (
    <div className="border-b border-glass-hairline px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            inputSize="sm"
            aria-label="Search comparisons"
            placeholder={t('Search cheque no., payee, amount…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-strong"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {statusTabs ?? (
          <Select
            inputSize="sm"
            aria-label="Filter by match status"
            className="w-auto min-w-[10rem]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="matched">Matched</option>
            <option value="mismatch">Mismatched</option>
            <option value="missing-in-qb">Missing in QB</option>
            <option value="missing-in-extraction">{t('Missing in cheques')}</option>
          </Select>
        )}

        {/* Date range, document, QB account and QB source. */}
        <div className="relative" ref={filtersRef}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
            icon={<SlidersHorizontal size={14} />}
            aria-expanded={showFilters}
          >
            Filters
            {hiddenFilterCount > 0 && (
              <Badge size="sm" tone="brand" className="nums">
                {hiddenFilterCount}
              </Badge>
            )}
            <ChevronDown size={10} aria-hidden />
          </Button>

          {showFilters && (
            <div className={`${POPOVER} left-0 w-[19rem] p-3`}>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    inputSize="sm"
                    type="date"
                    aria-label="Start date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <Input
                    inputSize="sm"
                    type="date"
                    aria-label="End date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <Select
                  inputSize="sm"
                  aria-label="Filter by document"
                  value={selectedPdfName}
                  onChange={(e) => setSelectedPdfName(e.target.value)}
                >
                  <option value="all">All documents</option>
                  {pdfNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>

                <Select
                  inputSize="sm"
                  aria-label="Filter by QuickBooks account"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  <option value="all">All QB accounts</option>
                  {accountNames.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </Select>

                <Select
                  inputSize="sm"
                  aria-label="Filter by QuickBooks source"
                  value={selectedQBSource}
                  onChange={(e) => setSelectedQBSource(e.target.value)}
                >
                  <option value="all">All QB sources</option>
                  {qbSources.map((source) => {
                    const label =
                      source === 'cheque_written'      ? 'Cheque written'   :
                      source === 'bill_paid_by_cheque' ? 'Bill paid'         :
                      source === 'cheque_received'     ? 'Cheque received'  :
                      source === 'payroll_check'       ? 'Payroll'           :
                      source === 'qbo_file_upload'     ? 'File upload'       :
                      source;
                    return (
                      <option key={source} value={source}>
                        {t(label)}
                      </option>
                    );
                  })}
                </Select>

                {hasActiveFilters && (
                  <Button
                    block
                    size="sm"
                    variant="ghost"
                    icon={<X size={12} />}
                    onClick={() => {
                      onResetFilters();
                      setShowFilters(false);
                    }}
                  >
                    Reset all filters
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant={showIssuesOnly ? 'primary' : 'secondary'}
          onClick={() => setShowIssuesOnly(!showIssuesOnly)}
          icon={<AlertTriangle size={12} />}
          title={showIssuesOnly ? 'Show all data' : 'Show only issues (duplicates & discrepancies)'}
        >
          {showIssuesOnly ? 'Showing issues' : 'Issues only'}
          {issueCount > 0 && (
            <Badge size="sm" tone={showIssuesOnly ? 'outline' : 'neutral'}>
              {issueCount}
            </Badge>
          )}
        </Button>

        <Button size="sm" variant="secondary" onClick={onUpload} icon={<Upload size={14} />}>
          Upload QB data
        </Button>

        <div className="relative export-dropdown">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowExportDropdown(!showExportDropdown)}
            icon={<Download size={12} />}
            aria-expanded={showExportDropdown}
          >
            Export
            <ChevronDown size={10} aria-hidden />
          </Button>

          {showExportDropdown && (
            <div className={`${POPOVER} right-0 w-40`}>
              <button type="button" onClick={onExportCSV} className={POPOVER_ITEM}>
                <Download size={14} />
                Export CSV
              </button>
              <button
                type="button"
                onClick={onExportExcel}
                className={`${POPOVER_ITEM} border-t border-glass-hairline`}
              >
                <Download size={14} />
                Export Excel
              </button>
            </div>
          )}
        </div>

        <Button size="sm" variant="ghost" onClick={onRefresh} loading={refreshing} icon={<RefreshCw size={12} />}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
};
