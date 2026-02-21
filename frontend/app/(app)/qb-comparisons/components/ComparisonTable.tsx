import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { ComparisonRow, SortField, SortDirection, formatCurrency, formatDate, parseAmount } from '../utils/comparisonUtils';
import { VisibleColumns } from '../hooks/useComparisonState';

interface ComparisonTableProps {
  data: ComparisonRow[];
  sortField: SortField;
  sortDirection: SortDirection;
  visibleColumns: VisibleColumns;
  onSort: (field: SortField) => void;
  onRowClick: (row: ComparisonRow) => void;
  currentPage: number;
  itemsPerPage: number;
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
  onSort,
  onRowClick,
  currentPage,
  itemsPerPage,
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
    if (row.matchStatus === 'matched') return 'bg-emerald-50';
    if (row.matchStatus === 'mismatch') return 'bg-amber-50';
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
                colSpan={5}
              >
                QuickBooks Data
              </th>
              <th 
                className="px-1 py-0.5 text-center font-semibold text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: shadeA.section, borderRight: '2px solid #0d1f3c' }}
                colSpan={2}
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
                style={{ backgroundColor: shadeB.column, borderRight: '2px solid #0d1f3c' }}
              >
                Account
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
                style={{ backgroundColor: shadeA.column, borderRight: '2px solid #0d1f3c' }}
              >
                Conf %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-2 py-8 text-center text-gray-400 text-xs">
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
                    {row.extractionData ? row.checkNumber || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r border-gray-200">
                    {row.extractionData && row.date ? formatDate(row.date) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right font-semibold text-emerald-700 border-r border-gray-200">
                    {row.extractionData && row.amount ? formatCurrency(row.amount) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-900 border-r border-gray-200 max-w-[120px] truncate">
                    {row.extractionData ? row.payee || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r-2 border-gray-300 max-w-[100px] truncate">
                    {row.extractionData ? row.bankAccount || '—' : '—'}
                  </td>

                  {/* QuickBooks Data */}
                  <td className="px-1 py-0.5 font-semibold text-gray-900 border-r border-gray-200">
                    {row.qbData ? row.qbData.checkNumber || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r border-gray-200">
                    {row.qbData && row.qbData.date ? formatDate(row.qbData.date) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-right font-semibold text-emerald-700 border-r border-gray-200">
                    {row.qbData && row.qbData.amount ? formatCurrency(row.qbData.amount) : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-900 border-r border-gray-200 max-w-[120px] truncate">
                    {row.qbData ? row.qbData.payee || '—' : '—'}
                  </td>
                  <td className="px-1 py-0.5 text-gray-600 border-r-2 border-gray-300 max-w-[100px] truncate">
                    {row.qbData ? row.qbData.account || '—' : '—'}
                  </td>

                  {/* Comparison */}
                  <td className={`px-1 py-0.5 text-center text-[9px] font-semibold border-r border-gray-200 ${row.matchStatus === 'matched' ? 'text-emerald-700' : row.matchStatus === 'mismatch' ? 'text-amber-700' : row.matchStatus === 'missing-in-qb' ? 'text-blue-700' : 'text-red-700'}`}>
                    {getMatchStatusText(row)}
                  </td>
                  <td className="px-1 py-0.5 text-center font-semibold border-r-2 border-gray-300">
                    {row.confidence !== undefined ? (
                      <span className={row.confidence >= 80 ? 'text-emerald-600' : row.confidence >= 60 ? 'text-amber-600' : 'text-red-600'}>
                        {row.confidence}%
                      </span>
                    ) : '—'}
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
              <td className="px-1 py-0.5 text-center border-r-2 border-gray-400">—</td>
              <td className="px-1 py-0.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
