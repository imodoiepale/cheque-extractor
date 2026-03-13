import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, Eye, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { ComparisonRow, SortField, SortDirection, formatCurrency, formatDate, parseAmount, DateFormat } from '../utils/comparisonUtils';
import { VisibleColumns } from '../hooks/useComparisonState';

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
}

const SortIcon: React.FC<{ field: SortField; sortField: SortField; sortDirection: SortDirection }> = ({
  field,
  sortField,
  sortDirection,
}) => {
  return (
    <div className="flex flex-col ml-1">
      <ChevronUp className={`h-2.5 w-2.5 ${sortField === field && sortDirection === 'asc' ? 'text-white' : 'text-white/40'}`} />
      <ChevronDown className={`h-2.5 w-2.5 -mt-0.5 ${sortField === field && sortDirection === 'desc' ? 'text-white' : 'text-white/40'}`} />
    </div>
  );
};

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  data,
  sortField,
  sortDirection,
  visibleColumns,
  dateFormat,
  onSort,
  onRowClick,
  currentPage,
  itemsPerPage,
  onVouch,
  onUnvouch,
  vouchingId,
}) => {
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage, itemsPerPage]);

  const totals = useMemo(() => {
    const checksTotal = data.reduce((sum, row) => {
      if (row.extractionData) {
        const amount = parseAmount(row.amount);
        return sum + amount;
      }
      return sum;
    }, 0);

    const qbTotal = data.reduce((sum, row) => {
      if (row.qbData) {
        const amount = parseAmount(row.qbData.amount);
        return sum + amount;
      }
      return sum;
    }, 0);

    return {
      count: data.length,
      checksTotal,
      qbTotal,
      difference: checksTotal - qbTotal,
    };
  }, [data]);

  const shadeA = { section: '#1a3a6e', column: '#2855a0', hover: '#3265b0' };
  const shadeB = { section: '#2a5498', column: '#3a70b8', hover: '#4880c5' };

  const getMatchStatusColor = (row: ComparisonRow) => {
    // Red highlight for rows with issues (when they have actual problems)
    if (row.hasIssue && (row.isDuplicate || row.matchStatus === 'mismatch')) {
      return 'bg-red-50 border-l-4 border-red-500';
    }
    if (row.matchStatus === 'matched') return 'bg-green-50 border-l-4 border-green-500';
    if (row.matchStatus === 'mismatch') return 'bg-amber-50 border-l-4 border-amber-500';
    if (row.matchStatus === 'missing-in-qb') return 'bg-blue-50';
    if (row.matchStatus === 'missing-in-extraction') return 'bg-red-50';
    return 'bg-white';
  };

  const getMatchStatusText = (row: ComparisonRow) => {
    if (row.matchStatus === 'matched') return '✓ Matched';
    if (row.matchStatus === 'mismatch') return '⚠ Mismatch';
    if (row.matchStatus === 'missing-in-qb') return '← Missing in QB';
    if (row.matchStatus === 'missing-in-extraction') return 'Missing in Checks →';
    return '';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse border border-gray-300" style={{ fontSize: '10px' }}>
          <thead className="sticky top-0 z-20">
            <tr className="text-white" style={{ height: '26px', backgroundColor: '#0a1a30' }}>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: shadeA.section, borderRight: '2px solid #0d1f3c' }}
                rowSpan={2}
              >
                #
              </th>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: shadeA.section, borderRight: '2px solid #0d1f3c' }}
                colSpan={5}
              >
                Check Extraction Data
              </th>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: shadeB.section, borderRight: '2px solid #0d1f3c' }}
                colSpan={6}
              >
                QuickBooks Data
              </th>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: shadeA.section, borderRight: '2px solid #0d1f3c' }}
                colSpan={3}
              >
                Comparison
              </th>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px]"
                style={{ backgroundColor: shadeA.section }}
                rowSpan={2}
              >
                View
              </th>
            </tr>
            <tr className="text-white" style={{ height: '24px' }}>
              {/* Index column already has rowSpan=2 */}
              {/* Check Extraction Columns */}
              <th
                onClick={() => onSort('checkNumber')}
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase cursor-pointer"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex items-center">
                  Check #
                  <SortIcon field="checkNumber" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                onClick={() => onSort('date')}
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase cursor-pointer"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex items-center">
                  Date
                  <SortIcon field="date" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                onClick={() => onSort('amount')}
                className="px-1 py-0.5 text-right text-[9px] font-medium uppercase cursor-pointer"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex items-center justify-end">
                  Amount
                  <SortIcon field="amount" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                onClick={() => onSort('payee')}
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase cursor-pointer"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex items-center">
                  Payee
                  <SortIcon field="payee" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeA.column, borderRight: '2px solid #0d1f3c' }}
              >
                Bank
              </th>

              {/* QuickBooks Columns */}
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Check #
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Date
              </th>
              <th
                className="px-1 py-0.5 text-right text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Amount
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Payee
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Account
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeB.column, borderRight: '2px solid #0d1f3c' }}
              >
                Source
              </th>

              {/* Comparison Columns */}
              <th
                onClick={() => onSort('matchStatus')}
                className="px-1 py-0.5 text-center text-[9px] font-medium uppercase cursor-pointer"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                <div className="flex items-center justify-center">
                  Status
                  <SortIcon field="matchStatus" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th
                className="px-1 py-0.5 text-center text-[9px] font-medium uppercase"
                style={{ backgroundColor: shadeA.column, borderRight: '1px solid rgba(255,255,255,0.15)' }}
              >
                Conf %
              </th>
              <th
                className="px-1 py-0.5 text-left text-[9px] font-medium uppercase"
                style={{ backgroundColor: '#8b2020', borderRight: '2px solid #0d1f3c' }}
              >
                Issue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-2 py-8 text-center text-gray-400 text-xs">
                  No matching records found
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`hover:bg-gray-100 transition cursor-pointer ${getMatchStatusColor(row)}`}
                  onClick={() => onRowClick(row)}
                  style={{ height: '22px' }}
                >
                  {/* Index */}
                  <td className="px-1 py-0.5 text-center font-semibold text-gray-500 border-r-2 border-gray-300 bg-gray-50">
                    {(currentPage - 1) * itemsPerPage + idx + 1}
                  </td>
                  {/* Check Extraction Data */}
                  <td className="px-1 py-0.5 font-semibold text-gray-900 border-r border-gray-200">
                    {row.extractionData || row.source === 'matched' ? row.checkNumber || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r border-gray-200">
                    {(row.extractionData || row.source === 'matched') && row.date ? formatDate(row.date, dateFormat) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right font-semibold text-emerald-700 border-r border-gray-200">
                    {(row.extractionData || row.source === 'matched') && row.amount ? formatCurrency(row.amount) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-900 border-r border-gray-200 max-w-[120px] truncate">
                    {row.extractionData || row.source === 'matched' ? row.payee || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r-2 border-gray-300 max-w-[100px] truncate">
                    {row.extractionData || row.source === 'matched' ? row.bankAccount || '—' : '—'}
                  </td>

                  {/* QuickBooks Data */}
                  <td className="px-1 py-0.5 font-semibold text-gray-900 border-r border-gray-200">
                    {row.qbData || row.source === 'matched' ? (row.qbData?.checkNumber || row.checkNumber || '—') : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r border-gray-200">
                    {(row.qbData || row.source === 'matched') && (row.qbData?.date || row.date) ? formatDate(row.qbData?.date || row.date, dateFormat) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right font-semibold text-emerald-700 border-r border-gray-200">
                    {(row.qbData || row.source === 'matched') && (row.qbData?.amount || row.amount) ? formatCurrency(row.qbData?.amount || row.amount) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-900 border-r border-gray-200 max-w-[120px] truncate">
                    {row.qbData || row.source === 'matched' ? (row.qbData?.payee || row.payee || '—') : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r border-gray-200 max-w-[100px] truncate">
                    {row.qbData || row.source === 'matched' ? (row.qbData?.account || row.bankAccount || '—') : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-center border-r-2 border-gray-300">
                    {row.qbData ? (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        row.qbData.qbSource === 'qbo_file_upload' 
                          ? 'bg-blue-100 text-blue-700' 
                          : row.qbData.qbSource?.includes('cheque') 
                            ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                      }`}>
                        {row.qbData.qbSource === 'qbo_file_upload' ? 'File' : 
                         row.qbData.qbSource?.includes('cheque') ? 'QB API' : 
                         row.qbData.qbSource || 'Unknown'}
                      </span>
                    ) : '—'}
                  </td>

                  {/* Comparison */}
                  <td className={`px-1 py-0.5 text-center text-[9px] font-semibold border-r border-gray-200 ${row.matchStatus === 'matched' ? 'text-emerald-700' : row.matchStatus === 'mismatch' ? 'text-amber-700' : row.matchStatus === 'missing-in-qb' ? 'text-blue-700' : 'text-red-700'}`}>
                    {getMatchStatusText(row)}
                  </td>
                  <td className="px-1 py-0.5 text-center font-semibold border-r border-gray-200">
                    {row.confidence !== undefined ? (
                      <span className={row.confidence >= 80 ? 'text-emerald-600' : row.confidence >= 60 ? 'text-amber-600' : 'text-red-600'}>
                        {row.confidence}%
                      </span>
                    ) : '—'}
                  </td>

                  {/* Issue Column */}
                  <td className={`px-1 py-0.5 text-left border-r-2 border-gray-300 max-w-[180px] ${row.hasIssue && !row.vouched ? 'bg-red-50' : row.vouched ? 'bg-green-50' : ''}`}>
                    {row.vouched ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-green-700 font-semibold flex items-center gap-0.5">
                          <CheckCircle size={10} className="text-green-600" />
                          Vouched
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUnvouch(row);
                          }}
                          disabled={vouchingId === row.id}
                          className="text-[8px] text-red-600 hover:text-red-800 underline disabled:opacity-50"
                          title="Remove vouch"
                        >
                          {vouchingId === row.id ? <Loader2 size={8} className="animate-spin" /> : 'Unvouch'}
                        </button>
                      </div>
                    ) : row.issues && row.issues.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            {row.issues.slice(0, 2).map((issue, i) => (
                              <div key={i} className="text-[9px] text-red-700 leading-tight truncate" title={issue}>
                                {row.isDuplicate && i === 0 ? '⚠️ ' : '• '}{issue}
                              </div>
                            ))}
                            {row.issues.length > 2 && (
                              <span className="text-[8px] text-red-500">+{row.issues.length - 2} more</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onVouch(row);
                            }}
                            disabled={vouchingId === row.id}
                            className="flex-shrink-0 px-1.5 py-0.5 text-[8px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                            title="Mark this issue as acceptable/resolved"
                          >
                            {vouchingId === row.id ? <Loader2 size={8} className="animate-spin" /> : 'Vouch'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[9px] text-green-600">✓</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-1 py-0.5 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                      className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="View Details"
                    >
                      <Eye size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="sticky bottom-0 bg-gray-100 border-t-2 border-gray-400">
            <tr className="font-bold text-gray-900" style={{ height: '24px' }}>
              <td className="px-1 py-0.5 text-center border-r-2 border-gray-400 bg-gray-200">
                Σ
              </td>
              <td colSpan={2} className="px-1 py-0.5 text-left border-r border-gray-300">
                Total: {totals.count}
              </td>
              <td className="px-1 py-0.5 text-right text-emerald-700 border-r border-gray-200">
                {formatCurrency(totals.checksTotal)}
              </td>
              <td colSpan={2} className="px-1 py-0.5 border-r-2 border-gray-400"></td>
              <td colSpan={2} className="px-1 py-0.5 border-r border-gray-300"></td>
              <td className="px-1 py-0.5 text-right text-emerald-700 border-r border-gray-200">
                {formatCurrency(totals.qbTotal)}
              </td>
              <td colSpan={2} className="px-1 py-0.5 border-r-2 border-gray-400"></td>
              <td className="px-1 py-0.5 text-center border-r border-gray-200">
                <span className={totals.difference === 0 ? 'text-emerald-700' : 'text-red-700'}>
                  Δ {formatCurrency(Math.abs(totals.difference))}
                </span>
              </td>
              <td className="px-1 py-0.5 text-center border-r border-gray-300">—</td>
              <td className="px-1 py-0.5 border-r-2 border-gray-400"></td>
              <td className="px-1 py-0.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
