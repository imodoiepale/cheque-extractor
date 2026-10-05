import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, FileCheck, DollarSign, Edit2, Save, XCircle, CheckCircle2, Ban, Loader2, Wrench } from 'lucide-react';
import {
  ComparisonRow,
  formatCurrency,
  formatDate,
  parseAmount,
  areDatesSameCalendarDay,
  normalizeCheckNum,
} from '../utils/comparisonUtils';
import { applyFixToQB, computeCorrections } from '../utils/fixDiscrepancy';

interface DetailModalProps {
  row: ComparisonRow | null;
  onClose: () => void;
  onSave?: (checkId: string, updates: any) => Promise<void>;
  onApprove?: (checkId: string) => Promise<void>;
  onReject?: (checkId: string) => Promise<void>;
  onFixed?: () => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ row, onClose, onSave, onApprove, onReject, onFixed }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [fixMessage, setFixMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editedData, setEditedData] = useState({
    checkNumber: '',
    date: '',
    amount: '',
    payee: '',
    bankAccount: '',
    memo: '',
  });

  // Update editedData when row changes
  useEffect(() => {
    if (row) {
      setEditedData({
        checkNumber: row.checkNumber || '',
        date: row.date || '',
        amount: row.amount || '',
        payee: row.payee || '',
        bankAccount: row.bankAccount || '',
        memo: row.memo || '',
      });
    }
  }, [row]);

  // #region agent log (off by default; enable via localStorage.setItem('kyriqDebugIngest', JSON.stringify({ url, sessionId })))
  useEffect(() => {
    if (!row?.qbData) return;
    let cfg: { url: string; sessionId: string } | null = null;
    try { cfg = JSON.parse(localStorage.getItem('kyriqDebugIngest') || 'null'); } catch {}
    if (!cfg?.url) return;
    const a = row.date ?? '';
    const b = row.qbData.date ?? '';
    fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': cfg.sessionId || '76c285' },
      body: JSON.stringify({
        sessionId: cfg.sessionId || '76c285',
        runId: 'ext-audit',
        hypothesisId: 'H-UI',
        location: 'DetailModal.tsx:dateCompare',
        message: 'modal row date vs qb date (strict eq drives ⚠ Different cell)',
        data: {
          rowDateRawLen: a.length,
          qbDateRawLen: b.length,
          strictEqual: a === b,
          normalizedEqual: areDatesSameCalendarDay(a, b),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [row?.id, row?.date, row?.qbData?.date]);
  // #endregion

  // Must sit ABOVE the early return: when `row` goes from set to null this
  // component returns before the hook, so React sees fewer hooks than the
  // previous render and throws. The `row ?` guard already makes it safe here.
  const corrections = useMemo(() => row ? computeCorrections(row) : {}, [row]);

  if (!row) return null;

  const handleApprove = async () => {
    if (!onApprove || !row?.extractionData?.check_id) return;
    setApproveError(null);
    setApproveSuccess(false);
    setIsApproving(true);
    try {
      await onApprove(row.extractionData.check_id);
      setApproveSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (error: any) {
      console.error('Failed to approve:', error);
      setApproveError(error.message || 'Failed to approve check. Please try again.');
    } finally {
      setIsApproving(false);
    }
  };

  const correctionCount = Object.keys(corrections).length;

  const handleFixInQB = async () => {
    if (!row) return;
    setFixMessage(null);
    if (correctionCount === 0) {
      setFixMessage({ type: 'info', text: 'Nothing to fix — extraction and QuickBooks values already match.' });
      return;
    }
    setIsFixing(true);
    try {
      const result = await applyFixToQB(row);
      if (result.skipped) {
        setFixMessage({ type: 'info', text: result.reason || 'Skipped — no changes' });
      } else if (result.ok) {
        const parts = Object.entries(result.fields || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
        setFixMessage({ type: 'success', text: `Fixed in QuickBooks ✓ ${parts ? `(${parts})` : ''}` });
        onFixed?.();
      } else {
        setFixMessage({ type: 'error', text: result.reason || 'Fix failed' });
      }
    } catch (e: any) {
      setFixMessage({ type: 'error', text: e?.message || 'Fix failed' });
    } finally {
      setIsFixing(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !row?.extractionData?.check_id) return;
    setApproveError(null);
    setIsRejecting(true);
    try {
      await onReject(row.extractionData.check_id);
      onClose();
    } catch (error: any) {
      console.error('Failed to reject:', error);
      setApproveError(error.message || 'Failed to reject check. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSave = async () => {
    if (!onSave || !row.extractionData) return;
    
    setIsSaving(true);
    try {
      await onSave(row.extractionData.check_id, editedData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save changes:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData({
      checkNumber: row?.checkNumber || '',
      date: row?.date || '',
      amount: row?.amount || '',
      payee: row?.payee || '',
      bankAccount: row?.bankAccount || '',
      memo: row?.memo || '',
    });
    setIsEditing(false);
  };

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
        className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h3 className="text-xl font-bold">
              Check #{row.checkNumber || 'N/A'}
            </h3>
            <p className="text-sm text-blue-100 mt-1">{isEditing ? 'Edit Mode - Correct Extraction Data' : 'Detailed Comparison View'}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-sm font-medium"
              >
                <Edit2 size={16} />
                Edit
              </button>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition text-sm font-medium disabled:opacity-50"
                >
                  <Save size={16} />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-sm font-medium disabled:opacity-50"
                >
                  <XCircle size={16} />
                  Cancel
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-auto">
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
                      {row.extractionData && row.qbData &&
                      (normalizeCheckNum(row.checkNumber) || row.checkNumber?.trim()) ===
                        (normalizeCheckNum(row.qbData.checkNumber) || row.qbData.checkNumber?.trim()) ? (
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
                      {row.extractionData && row.qbData && areDatesSameCalendarDay(row.date, row.qbData.date) ? (
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
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.checkNumber}
                        onChange={(e) => setEditedData({ ...editedData, checkNumber: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900 mt-1">{row.checkNumber || '—'}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Date:</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editedData.date}
                        onChange={(e) => setEditedData({ ...editedData, date: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900 mt-1">{row.date ? formatDate(row.date) : '—'}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Amount:</span>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedData.amount}
                        onChange={(e) => setEditedData({ ...editedData, amount: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 font-bold"
                      />
                    ) : (
                      <p className="text-sm font-bold text-emerald-700 mt-1">{row.amount ? formatCurrency(row.amount) : '—'}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Payee:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.payee}
                        onChange={(e) => setEditedData({ ...editedData, payee: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900 mt-1">{row.payee || '—'}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Bank:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.bankAccount}
                        onChange={(e) => setEditedData({ ...editedData, bankAccount: e.target.value })}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                      />
                    ) : (
                      <p className="text-sm font-semibold text-gray-900 mt-1">{row.bankAccount || '—'}</p>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 font-medium">Memo:</span>
                    {isEditing ? (
                      <textarea
                        value={editedData.memo}
                        onChange={(e) => setEditedData({ ...editedData, memo: e.target.value })}
                        rows={2}
                        className="w-full mt-1 px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 resize-none"
                      />
                    ) : (
                      <p className="text-sm text-gray-700 mt-1">{row.memo || '—'}</p>
                    )}
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

        {/* Action bar */}
        {row.extractionData && (onApprove || onReject) && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl">
            {approveError && (
              <div className="mb-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                <span className="mt-0.5">⚠</span>
                <span>{approveError}</span>
              </div>
            )}
            {approveSuccess && (
              <div className="mb-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
                <CheckCircle2 size={15} />
                <span>Approved! Closing…</span>
              </div>
            )}
            {fixMessage && (
              <div className={`mb-3 flex items-start gap-2 text-sm border rounded-lg px-4 py-2 ${
                fixMessage.type === 'success' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                fixMessage.type === 'error'   ? 'text-red-700 bg-red-50 border-red-200' :
                                                'text-blue-700 bg-blue-50 border-blue-200'
              }`}>
                <span>{fixMessage.type === 'success' ? '✓' : fixMessage.type === 'error' ? '⚠' : 'ℹ'}</span>
                <span>{fixMessage.text}</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500 font-medium mr-auto">Actions for Check #{row.checkNumber || row.extractionData.check_id}</span>
              {row.matchStatus === 'mismatch' && row.qbData && (
                <button
                  onClick={handleFixInQB}
                  disabled={isApproving || isRejecting || isFixing || approveSuccess || correctionCount === 0}
                  title={correctionCount === 0
                    ? 'No differences to push'
                    : `Push ${correctionCount} field${correctionCount === 1 ? '' : 's'} to QuickBooks: ${Object.keys(corrections).join(', ')}`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
                >
                  {isFixing ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
                  {isFixing ? 'Fixing…' : `Fix in QB${correctionCount > 0 ? ` (${correctionCount})` : ''}`}
                </button>
              )}
              {onApprove && (
                <button
                  onClick={handleApprove}
                  disabled={isApproving || isRejecting || approveSuccess}
                  title={row.qbData ? 'Approve and stamp Cleared note in QuickBooks' : 'Approve in Kyriq only — no QB transaction linked'}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 text-white ${
                    approveSuccess ? 'bg-emerald-400 cursor-default' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isApproving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {isApproving ? 'Approving…' : approveSuccess ? '✓ Approved' : (row.qbData ? 'Approve & Clear' : 'Approve')}
                </button>
              )}
              {onReject && (
                <button
                  onClick={handleReject}
                  disabled={isApproving || isRejecting || approveSuccess}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
                >
                  {isRejecting ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                  {isRejecting ? 'Rejecting…' : 'Reject'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
