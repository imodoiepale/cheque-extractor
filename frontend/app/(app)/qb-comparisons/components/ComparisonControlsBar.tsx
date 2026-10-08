import React, { useState } from 'react';
import { Search, Upload, Download, ChevronDown, RefreshCw, X, Filter, AlertTriangle, Calendar } from 'lucide-react';
import { Badge, Button, GlassCard, IconButton, Input, Select } from '@/components/ui';
import { DateFormat, DATE_FORMAT_OPTIONS } from '../utils/comparisonUtils';

/**
 * Filter + action chrome for the grid.
 *
 * One blurred card. The two popovers inside it are deliberately OPAQUE
 * (`bg-surface`, no backdrop-filter): a blurred popover over a blurred card
 * double-composites and both go muddy (rule 2).
 */

/** Popover surface shared by the export and date-format menus. */
const POPOVER =
  'absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-input border border-glass-hairline bg-surface shadow-glass-modal animate-popover-in';

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
  onUpload: () => void;
  onExportCSV: () => void;
  onExportExcel: () => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  showIssuesOnly: boolean;
  setShowIssuesOnly: (show: boolean) => void;
  issueCount: number;
  dateFormat: DateFormat;
  setDateFormat: (fmt: DateFormat) => void;
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
  onUpload,
  onExportCSV,
  onExportExcel,
  onResetFilters,
  hasActiveFilters,
  showIssuesOnly,
  setShowIssuesOnly,
  issueCount,
  dateFormat,
  setDateFormat,
}) => {
  const [showDateFormatMenu, setShowDateFormatMenu] = useState(false);

  return (
    <GlassCard padding="sm" className="mx-4 mt-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6 xl:grid-cols-12">
        <div className="relative col-span-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            inputSize="sm"
            aria-label="Search comparisons"
            placeholder="Search check #, payee, amount…"
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

        <Select
          inputSize="sm"
          aria-label="Filter by document"
          className="col-span-2"
          value={selectedPdfName}
          onChange={(e) => setSelectedPdfName(e.target.value)}
        >
          <option value="all">All Documents</option>
          {pdfNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>

        <Select
          inputSize="sm"
          aria-label="Filter by QuickBooks account"
          className="col-span-2"
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
        >
          <option value="all">All QB Accounts</option>
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
          <option value="all">All QB Sources</option>
          {qbSources.map((source) => {
            const label =
              source === 'cheque_written'      ? '📝 Cheque Written'   :
              source === 'bill_paid_by_cheque' ? '💸 Bill Paid'         :
              source === 'cheque_received'     ? '✉️ Cheque Received'  :
              source === 'payroll_check'       ? '💰 Payroll'           :
              source === 'qbo_file_upload'     ? '📂 File Upload'       :
              source;
            return (
              <option key={source} value={source}>
                {label}
              </option>
            );
          })}
        </Select>

        <Select
          inputSize="sm"
          aria-label="Filter by match status"
          className="col-span-2"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="matched">Matched</option>
          <option value="mismatch">Mismatched</option>
          <option value="missing-in-qb">Missing in QB</option>
          <option value="missing-in-extraction">Missing in Extraction</option>
        </Select>

        <div className="flex items-center">
          {hasActiveFilters && (
            <IconButton size="icon-sm" aria-label="Reset filters" onClick={onResetFilters}>
              <Filter size={14} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={showIssuesOnly ? 'destructive' : 'secondary'}
          onClick={() => setShowIssuesOnly(!showIssuesOnly)}
          icon={<AlertTriangle size={12} />}
          title={showIssuesOnly ? 'Show all data' : 'Show only issues (duplicates & discrepancies)'}
        >
          {showIssuesOnly ? 'Showing Issues' : 'Issues'}
          {issueCount > 0 && (
            <Badge size="sm" tone={showIssuesOnly ? 'outline' : 'error'}>
              {issueCount}
            </Badge>
          )}
        </Button>

        <Button size="sm" onClick={onUpload} icon={<Upload size={14} />}>
          Upload QB Data
        </Button>

        <div className="relative">
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
            <div className={`${POPOVER} w-40`}>
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

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowDateFormatMenu(!showDateFormatMenu)}
            icon={<Calendar size={12} />}
            title="Change date display format"
            aria-expanded={showDateFormatMenu}
          >
            <span className="nums">
              {DATE_FORMAT_OPTIONS.find((o) => o.value === dateFormat)?.example || dateFormat}
            </span>
            <ChevronDown size={10} aria-hidden />
          </Button>
          {showDateFormatMenu && (
            <div className={`${POPOVER} w-48`}>
              {DATE_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setDateFormat(opt.value);
                    setShowDateFormatMenu(false);
                  }}
                  className={`${POPOVER_ITEM} justify-between ${
                    dateFormat === opt.value ? 'bg-brand/[0.08] font-semibold text-brand-deep' : ''
                  }`}
                >
                  <span>{opt.label}</span>
                  {dateFormat === opt.value && <span aria-hidden>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button size="sm" variant="ghost" onClick={onRefresh} icon={<RefreshCw size={12} />}>
          Refresh
        </Button>
      </div>
    </GlassCard>
  );
};
