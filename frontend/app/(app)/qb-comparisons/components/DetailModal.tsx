import React from 'react';
import { X, AlertCircle, FileCheck, DollarSign } from 'lucide-react';
import { ComparisonRow, formatCurrency, formatDate, parseAmount } from '../utils/comparisonUtils';

interface DetailModalProps {
  row: ComparisonRow | null;
  onClose: () => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ row, onClose }) => {
  if (!row) return null;

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      matched: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
      mismatch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
      'missing-in-qb': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
      'missing-in-extraction': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.matched;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${config.bg} ${config.text} ${config.border}`}>
        {status.replace(/-/g, ' ')}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="text-xl font-bold">
              Check #{row.checkNumber || 'N/A'}
            </h3>
            <p className="text-sm text-blue-100 mt-1">Detailed Comparison View</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Check Image at Top */}
          {(row.extractionData?.image_file || row.extractionData?.image_url || row.extractionData?.storage_url) && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Check Image</h4>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <img
                  src={(() => {
                    // Priority 1: storage_url (Supabase Storage direct URL)
                    if (row.extractionData.storage_url) return row.extractionData.storage_url;
                    
                    // Priority 2: image_url (full URL)
                    if (row.extractionData.image_url) return row.extractionData.image_url;
                    
                    // Priority 3: image_file if it's a full URL
                    if (row.extractionData.image_file?.startsWith('http')) return row.extractionData.image_file;
                    
                    // Priority 4: Backend API endpoint (works even if local files are cleaned up)
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';
                    return `${backendUrl}/api/checks/${row.extractionData.job_id}/${row.extractionData.check_id}/image`;
                  })()}
                  alt="Check"
                  className="w-full h-auto rounded-lg shadow-md max-h-96 object-contain"
                  onError={(e) => {
                    console.error('Image failed to load:', {
                      storage_url: row.extractionData?.storage_url,
                      image_url: row.extractionData?.image_url,
                      image_file: row.extractionData?.image_file,
                      check_id: row.extractionData?.check_id,
                      job_id: row.extractionData?.job_id,
                      backend_url: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090',
                      constructed_url: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'}/api/checks/${row.extractionData?.job_id}/${row.extractionData?.check_id}/image`
                    });
                    const target = e.currentTarget;
                    target.parentElement!.innerHTML = '<div class="text-center text-gray-400 py-8">Image not available</div>';
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Match Status</h4>
            <div className="flex items-center gap-4">
              {getStatusBadge(row.matchStatus)}
              {row.confidence !== undefined && (
                <span className="text-sm text-gray-600">
                  Confidence: <span className={`font-bold ${
                    row.confidence >= 80 ? 'text-emerald-600' :
                    row.confidence >= 60 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>{row.confidence}%</span>
                </span>
              )}
            </div>
          </div>

          {row.discrepancies && row.discrepancies.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Discrepancies</h4>
              <div className="space-y-2">
                {row.discrepancies.map((disc, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 px-4 py-3 rounded-lg border border-amber-200">
                    <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{disc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comparison Table */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Data Comparison</h4>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-slate-600">Field</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-slate-600">Check Extraction</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-slate-600">QuickBooks</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Check Number</td>
                    <td className="px-3 py-2 text-gray-900">{row.extractionData?.checkNumber || row.checkNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-900">{row.qbData?.checkNumber || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {row.extractionData && row.qbData && row.checkNumber === row.qbData.checkNumber ? (
                        <span className="text-emerald-600 font-semibold">✓ Match</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">⚠ Different</span>
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Date</td>
                    <td className="px-3 py-2 text-gray-600">{row.extractionData && row.date ? formatDate(row.date) : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.qbData?.date ? formatDate(row.qbData.date) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {row.extractionData && row.qbData && row.date === row.qbData.date ? (
                        <span className="text-emerald-600 font-semibold">✓ Match</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">⚠ Different</span>
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Amount</td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{row.extractionData && row.amount ? formatCurrency(row.amount) : '—'}</td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{row.qbData?.amount ? formatCurrency(row.qbData.amount) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {row.extractionData && row.qbData ? (
                        Math.abs(parseAmount(row.amount) - parseAmount(row.qbData.amount)) < 0.01 ? (
                          <span className="text-emerald-600 font-semibold">✓ Match</span>
                        ) : (
                          <span className="text-red-600 font-semibold">
                            Δ {formatCurrency(Math.abs(parseAmount(row.amount) - parseAmount(row.qbData.amount)))}
                          </span>
                        )
                      ) : '—'}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Payee</td>
                    <td className="px-3 py-2 text-gray-900">{row.extractionData ? row.payee || '—' : '—'}</td>
                    <td className="px-3 py-2 text-gray-900">{row.qbData?.payee || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {row.extractionData && row.qbData && row.payee?.toLowerCase() === row.qbData.payee?.toLowerCase() ? (
                        <span className="text-emerald-600 font-semibold">✓ Match</span>
                      ) : (
                        <span className="text-amber-600 font-semibold">⚠ Different</span>
                      )}
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Bank/Account</td>
                    <td className="px-3 py-2 text-gray-600">{row.extractionData ? row.bankAccount || '—' : '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.qbData?.account || '—'}</td>
                    <td className="px-3 py-2 text-center">—</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-700">Memo</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{row.extractionData ? row.memo || '—' : '—'}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{row.qbData?.memo || '—'}</td>
                    <td className="px-3 py-2 text-center">—</td>
                  </tr>
                  {row.qbData?.qbSource && (
                    <tr className="hover:bg-gray-50 bg-blue-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">QB Source</td>
                      <td className="px-3 py-2 text-gray-400">—</td>
                      <td className="px-3 py-2 text-blue-700 font-semibold">{row.qbData.qbSource}</td>
                      <td className="px-3 py-2 text-center">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Extraction Methods Comparison Table */}
          {row.extractionData && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Extraction Methods Comparison</h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-xs">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-blue-500">Field</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-blue-500">OCR Extraction</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase border-r border-blue-500">AI Vision</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase">Manual Entry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Check Number</td>
                      <td className="px-3 py-2 text-gray-900">{row.extractionData.extraction?.checkNumber ? (typeof row.extractionData.extraction.checkNumber === 'object' ? row.extractionData.extraction.checkNumber.value : row.extractionData.extraction.checkNumber) : '—'}</td>
                      <td className="px-3 py-2 text-gray-900">{row.extractionData.checkNumber || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">—</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Date</td>
                      <td className="px-3 py-2 text-gray-600">{row.extractionData.extraction?.checkDate ? (typeof row.extractionData.extraction.checkDate === 'object' ? formatDate(row.extractionData.extraction.checkDate.value) : formatDate(row.extractionData.extraction.checkDate)) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.date ? formatDate(row.date) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">—</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Amount</td>
                      <td className="px-3 py-2 font-bold text-emerald-700">{row.extractionData.extraction?.amount ? (typeof row.extractionData.extraction.amount === 'object' ? formatCurrency(row.extractionData.extraction.amount.value) : formatCurrency(row.extractionData.extraction.amount)) : '—'}</td>
                      <td className="px-3 py-2 font-bold text-emerald-700">{row.amount ? formatCurrency(row.amount) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">—</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Payee</td>
                      <td className="px-3 py-2 text-gray-900">{row.extractionData.extraction?.payee ? (typeof row.extractionData.extraction.payee === 'object' ? row.extractionData.extraction.payee.value : row.extractionData.extraction.payee) : '—'}</td>
                      <td className="px-3 py-2 text-gray-900">{row.payee || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">—</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Bank</td>
                      <td className="px-3 py-2 text-gray-600">{row.extractionData.extraction?.bankName ? (typeof row.extractionData.extraction.bankName === 'object' ? row.extractionData.extraction.bankName.value : row.extractionData.extraction.bankName) : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{row.bankAccount || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">—</td>
                    </tr>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">Memo</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.extractionData.extraction?.memo ? (typeof row.extractionData.extraction.memo === 'object' ? row.extractionData.extraction.memo.value : row.extractionData.extraction.memo) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{row.memo || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileCheck size={14} />
                Extraction Source
              </h4>
              {row.extractionData ? (
                <div className="space-y-3 bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Source:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.extractionData.pdf_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Page:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.extractionData.page}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Check Number:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.checkNumber || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Date:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.date ? formatDate(row.date) : '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Amount:</span>
                    <p className="text-sm font-bold text-emerald-700 mt-1">{row.amount ? formatCurrency(row.amount) : '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Payee:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.payee || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Bank:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.bankAccount || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Memo:</span>
                    <p className="text-sm text-gray-700 mt-1">{row.memo || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  No extraction data available
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <DollarSign size={14} />
                QuickBooks Data
              </h4>
              {row.qbData ? (
                <div className="space-y-3 bg-green-50/50 rounded-xl p-4 border border-green-100">
                  <div>
                    <span className="text-xs text-gray-500 font-medium">QB Source:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.qbData.qbSource || 'Default'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Check Number:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.qbData.checkNumber || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Date:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.qbData.date ? formatDate(row.qbData.date) : '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Amount:</span>
                    <p className="text-sm font-bold text-emerald-700 mt-1">{row.qbData.amount ? formatCurrency(row.qbData.amount) : '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Payee:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.qbData.payee || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Account:</span>
                    <p className="text-sm font-semibold text-gray-900 mt-1">{row.qbData.account || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Memo:</span>
                    <p className="text-sm text-gray-700 mt-1">{row.qbData.memo || '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  No QuickBooks data available
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
