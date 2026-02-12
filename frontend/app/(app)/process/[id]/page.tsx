'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCheckProcessing } from '@/lib/hooks/useCheckProcessing';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle, Clock, Loader2, FileText, Image as ImageIcon,
  Download, Eye, X, ChevronLeft, ChevronRight, LayoutGrid, List,
  ZoomIn, ZoomOut, AlertCircle, RefreshCw,
} from 'lucide-react';

type ViewMode = 'card' | 'table';

const STAGES = [
  { name: 'upload', label: 'Upload & Validate' },
  { name: 'segmentation', label: 'Cheque Detection' },
  { name: 'extraction', label: 'Data Extraction' },
  { name: 'merging', label: 'Merge & Validate' },
  { name: 'complete', label: 'Complete' },
];

function extVal(ext: any, field: string): string {
  if (!ext) return '';
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.value || '';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  return '';
}

function extConf(ext: any, field: string): number {
  if (!ext) return 0;
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.confidence || 0;
  return 0;
}

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const jobId = params?.id ?? '';

  // Get selected methods from URL query (passed from upload page)
  const selectedMethods = useMemo(() => {
    const m = searchParams?.get('methods');
    return m ? m.split(',') : ['hybrid'];
  }, [searchParams]);

  const { currentStage, progress, isComplete, error, jobData, methodsProgress } =
    useCheckProcessing(jobId, selectedMethods);

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);

  const stageIndex = STAGES.findIndex((s) => s.name === currentStage);
  const checks = jobData?.checks || [];

  const EXPORT_FORMATS = [
    { id: 'csv', name: 'Generic CSV', desc: 'Excel, Google Sheets', icon: '📊' },
    { id: 'iif', name: 'QuickBooks Desktop', desc: 'IIF format (CHECK transactions)', icon: '💼' },
    { id: 'qbo', name: 'QuickBooks Online', desc: 'CSV bank transaction import', icon: '☁️' },
    { id: 'xero', name: 'Xero', desc: 'Bank statement CSV', icon: '📘' },
    { id: 'zoho', name: 'Zoho Books', desc: 'Bank statement CSV', icon: '📗' },
    { id: 'sage', name: 'Sage', desc: 'Accounting CSV import', icon: '📕' },
  ];

  // Arrow key navigation in dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (selectedIdx === null) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev !== null && prev < checks.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'Escape') {
        setSelectedIdx(null);
        setExportOpen(false);
      }
    },
    [selectedIdx, checks.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const [reExtracting, setReExtracting] = useState(false);

  const handleExport = (format: string) => {
    window.open(`/api/jobs/${jobId}/export?format=${format}`, '_blank');
    setExportOpen(false);
  };

  const handleReExtract = async (force: boolean = true) => {
    setReExtracting(true);
    try {
      const res = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, methods: selectedMethods, force }),
      });
      if (!res.ok) throw new Error('Failed to start re-extraction');
      window.location.reload();
    } catch (e: any) {
      console.error('Re-extract error:', e);
      setReExtracting(false);
    }
  };

  const selected = selectedIdx !== null ? checks[selectedIdx] : null;
  const missingCount = checks.filter((c: any) => !c.extraction).length;

  // Method progress status icon
  const methodStatusIcon = (status: string) => {
    if (status === 'complete') return <CheckCircle className="text-green-600" size={18} />;
    if (status === 'running') return <Loader2 className="text-blue-600 animate-spin" size={18} />;
    if (status === 'error') return <AlertCircle className="text-red-600" size={18} />;
    return <Clock className="text-gray-400" size={18} />;
  };

  const methodStatusColor = (status: string) => {
    if (status === 'complete') return 'border-green-200 bg-green-50';
    if (status === 'running') return 'border-blue-200 bg-blue-50';
    if (status === 'error') return 'border-red-200 bg-red-50';
    return 'border-gray-200 bg-gray-50';
  };

  const methodBarColor = (status: string) => {
    if (status === 'complete') return 'bg-green-500';
    if (status === 'running') return 'bg-blue-500';
    if (status === 'error') return 'bg-red-500';
    return 'bg-gray-300';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isComplete ? 'Extraction Results' : 'Processing Cheques'}
          </h1>
          <p className="text-gray-600 mt-1">
            {jobData?.pdf_name || 'Uploading...'}
            {jobData?.doc_format && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                {jobData.doc_format}
              </span>
            )}
          </p>
        </div>
        {isComplete && checks.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Re-extract button */}
            <button
              onClick={() => handleReExtract(missingCount > 0 ? false : true)}
              disabled={reExtracting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition disabled:opacity-50 text-sm font-medium"
              title={missingCount > 0 ? `Re-extract ${missingCount} missing cheques` : 'Force re-extract all cheques'}
            >
              {reExtracting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {missingCount > 0 ? `Re-extract (${missingCount} missing)` : 'Re-extract'}
            </button>
            {/* Export dropdown */}
            <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Download size={18} />
              Export
              <ChevronRight size={14} className={`transition-transform ${exportOpen ? 'rotate-90' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border z-50 py-1">
                {EXPORT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => handleExport(fmt.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition"
                  >
                    <p className="text-sm font-medium text-gray-900">{fmt.name}</p>
                    <p className="text-xs text-gray-500">{fmt.desc}</p>
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Processing Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────── */}
      {jobData && (jobData.total_pages > 0 || jobData.total_checks > 0) && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 rounded-lg">
              <FileText className="text-blue-600" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pages</p>
              <p className="text-2xl font-bold">{jobData.total_pages}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
            <div className="p-2.5 bg-green-50 rounded-lg">
              <ImageIcon className="text-green-600" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Cheques</p>
              <p className="text-2xl font-bold">{jobData.total_checks}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
            <div className="p-2.5 bg-purple-50 rounded-lg">
              <CheckCircle className="text-purple-600" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
              <p className="text-2xl font-bold capitalize">{isComplete ? 'Complete' : jobData.status}</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PROCESSING VIEW (while not complete)
         ══════════════════════════════════════════════════════ */}
      {!isComplete && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Pipeline stages ──────────────────────────── */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Processing Pipeline</h2>
            <div className="space-y-3">
              {STAGES.map((stage, index) => {
                const isDone = index < stageIndex || (isComplete && index <= stageIndex);
                const isCurrent = index === stageIndex && !isComplete;
                return (
                  <div key={stage.name} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isDone ? 'bg-green-100' : isCurrent ? 'bg-blue-100' : 'bg-gray-100'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle className="text-green-600" size={16} />
                      ) : isCurrent ? (
                        <Loader2 className="text-blue-600 animate-spin" size={16} />
                      ) : (
                        <Clock className="text-gray-400" size={16} />
                      )}
                    </div>
                    <span className={`text-sm ${isCurrent ? 'text-blue-600 font-medium' : isDone ? 'text-green-700' : 'text-gray-500'}`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Overall progress bar */}
            <div className="mt-5">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">{progress}%</p>
            </div>
          </div>

          {/* ── Per-method extraction progress ───────────── */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Extraction Methods</h2>
            {methodsProgress.length > 0 ? (
              <div className="space-y-4">
                {methodsProgress.map((mp) => (
                  <div key={mp.method} className={`rounded-lg border p-4 transition ${methodStatusColor(mp.status)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {methodStatusIcon(mp.status)}
                        <span className="font-medium text-sm text-gray-900">{mp.label}</span>
                      </div>
                      <span className="text-xs font-medium text-gray-600 capitalize">{mp.status}</span>
                    </div>
                    <div className="w-full bg-white/60 rounded-full h-2 mb-1.5">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${methodBarColor(mp.status)}`}
                        style={{ width: `${mp.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{mp.checks_processed} / {mp.checks_total} cheques</span>
                      <span>{mp.progress}%</span>
                    </div>
                    {mp.error && <p className="text-xs text-red-600 mt-1">{mp.error}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">
                Waiting for extraction to begin...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cheque image previews (show during processing too) ── */}
      {!isComplete && checks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Detected Cheques ({checks.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {checks.map((check: any, idx: number) => (
              <div
                key={check.check_id}
                onClick={() => setSelectedIdx(idx)}
                className="bg-gray-50 rounded-lg overflow-hidden border hover:border-blue-300 hover:shadow-md transition cursor-pointer group"
              >
                <div className="aspect-[16/9] bg-gray-100 relative overflow-hidden">
                  <img
                    src={`/api/check-image/${jobId}/${check.check_id}`}
                    alt={`Cheque ${idx + 1}`}
                    className="w-full h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-white/90 rounded-full p-1.5">
                      <Eye size={16} className="text-gray-700" />
                    </div>
                  </div>
                </div>
                <div className="p-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">Cheque {idx + 1}</span>
                  <span className="text-xs text-gray-400">Page {check.page}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          RESULTS VIEW (when complete)
         ══════════════════════════════════════════════════════ */}
      {isComplete && checks.length > 0 && (
        <>
          {/* View mode toggle + header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Extracted Cheques ({checks.length})
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-400 hidden md:block">Click to view details. Arrow keys to navigate.</p>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('card')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    viewMode === 'card' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <LayoutGrid size={14} /> Cards
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    viewMode === 'table' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List size={14} /> Table
                </button>
              </div>
            </div>
          </div>

          {/* ── Card View ─────────────────────────────────── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {checks.map((check: any, idx: number) => {
                const ext = check.extraction;
                return (
                  <div
                    key={check.check_id}
                    onClick={() => setSelectedIdx(idx)}
                    className={`bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer border-2 overflow-hidden group ${
                      selectedIdx === idx ? 'border-blue-400' : 'border-transparent hover:border-blue-200'
                    }`}
                  >
                    <div className="aspect-[16/9] bg-gray-100 relative overflow-hidden">
                      <img
                        src={`/api/check-image/${jobId}/${check.check_id}`}
                        alt={`Cheque ${idx + 1}`}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 rounded-full p-2 shadow">
                          <ZoomIn size={18} className="text-gray-700" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded font-medium">
                        #{idx + 1}
                      </div>
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                        Page {check.page}
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-900 truncate">
                          {extVal(ext, 'payee') || 'Unknown Payee'}
                        </p>
                        <p className="font-bold text-green-700 whitespace-nowrap ml-2">
                          {extVal(ext, 'amount') ? `$${extVal(ext, 'amount')}` : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {extVal(ext, 'checkDate') && <span>{extVal(ext, 'checkDate')}</span>}
                        {extVal(ext, 'checkNumber') && <span>#{extVal(ext, 'checkNumber')}</span>}
                        {extVal(ext, 'bankName') && <span>{extVal(ext, 'bankName')}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Table View ────────────────────────────────── */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Page</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payee</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check #</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {checks.map((check: any, idx: number) => {
                      const ext = check.extraction;
                      return (
                        <tr
                          key={check.check_id}
                          className={`hover:bg-blue-50 cursor-pointer transition ${
                            selectedIdx === idx ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => setSelectedIdx(idx)}
                        >
                          <td className="px-3 py-2">
                            <div className="w-20 h-12 bg-gray-100 rounded overflow-hidden">
                              <img
                                src={`/api/check-image/${jobId}/${check.check_id}`}
                                alt={`Cheque ${idx + 1}`}
                                className="w-full h-full object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-gray-500 font-mono text-xs">{idx + 1}</td>
                          <td className="px-3 py-3">{check.page}</td>
                          <td className="px-3 py-3 font-medium">{extVal(ext, 'payee') || '—'}</td>
                          <td className="px-3 py-3 font-medium text-green-700">{extVal(ext, 'amount') ? `$${extVal(ext, 'amount')}` : '—'}</td>
                          <td className="px-3 py-3">{extVal(ext, 'checkDate') || '—'}</td>
                          <td className="px-3 py-3">{extVal(ext, 'checkNumber') || '—'}</td>
                          <td className="px-3 py-3 text-gray-500">{extVal(ext, 'bankName') || '—'}</td>
                          <td className="px-3 py-3 text-center">
                            <button className="text-blue-600 hover:text-blue-800">
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Per-method final summary ──────────────────── */}
          {methodsProgress.length > 0 && (
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Extraction Method Results</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {methodsProgress.map((mp) => (
                  <div key={mp.method} className={`rounded-lg border p-4 ${methodStatusColor(mp.status)}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {methodStatusIcon(mp.status)}
                      <span className="font-medium text-gray-900">{mp.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {mp.checks_processed} / {mp.checks_total} cheques processed
                      </span>
                      <span className={`font-bold ${mp.status === 'complete' ? 'text-green-600' : mp.status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                        {mp.progress}%
                      </span>
                    </div>
                    {mp.error && <p className="text-xs text-red-600 mt-2">{mp.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              EXPORT SECTION
             ══════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Export Results</h2>
                <p className="text-sm text-gray-500 mt-0.5">Download extracted cheque data in your preferred accounting format</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <CheckCircle size={16} className="text-green-500" />
                {checks.length} cheque{checks.length !== 1 ? 's' : ''} ready
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => handleExport(fmt.id)}
                  className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50/50 transition text-left group"
                >
                  <div className="p-2.5 bg-green-50 rounded-lg group-hover:bg-green-100 transition flex-shrink-0">
                    <Download size={18} className="text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900">{fmt.name}</p>
                    <p className="text-xs text-gray-500 truncate">{fmt.desc}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-green-500 transition flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── No results ──────────────────────────────────────── */}
      {isComplete && checks.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <ImageIcon className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-semibold text-gray-700">No Cheques Found</h3>
          <p className="text-sm text-gray-500 mt-1">No cheques were detected in this document.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          DETAIL DIALOG
         ══════════════════════════════════════════════════════ */}
      {selected && selectedIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setSelectedIdx(null); setImageZoom(1); }}>
          <div
            className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-5xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">
                  Cheque {selectedIdx + 1} of {checks.length}
                </h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {selected.check_id}
                </span>
                <span className="text-xs text-gray-400">Page {selected.page}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={imageZoom <= 0.5}>
                  <ZoomOut size={16} />
                </button>
                <span className="text-xs font-medium text-gray-500 min-w-[2.5rem] text-center">{(imageZoom * 100).toFixed(0)}%</span>
                <button onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={imageZoom >= 3}>
                  <ZoomIn size={16} />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <button
                  onClick={() => { setSelectedIdx(Math.max(0, selectedIdx - 1)); setImageZoom(1); }}
                  disabled={selectedIdx === 0}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  title="Previous"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm text-gray-500">{selectedIdx + 1}/{checks.length}</span>
                <button
                  onClick={() => { setSelectedIdx(Math.min(checks.length - 1, selectedIdx + 1)); setImageZoom(1); }}
                  disabled={selectedIdx === checks.length - 1}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  title="Next"
                >
                  <ChevronRight size={20} />
                </button>
                <button onClick={() => { setSelectedIdx(null); setImageZoom(1); }} className="p-1.5 rounded hover:bg-gray-100 ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Dialog body: image left, data right */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="w-1/2 flex items-center justify-center bg-gray-50 border-r overflow-auto p-4">
                <img
                  src={`/api/check-image/${jobId}/${selected.check_id}`}
                  alt={selected.check_id}
                  className="rounded shadow-lg transition-transform"
                  style={{
                    transform: `scale(${imageZoom})`,
                    transformOrigin: 'center center',
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                  }}
                />
              </div>

              <div className="w-1/2 p-6 overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-4">Extracted Data</h4>
                {selected!.extraction ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Payee', field: 'payee' },
                      { label: 'Amount', field: 'amount' },
                      { label: 'Date', field: 'checkDate' },
                      { label: 'Check Number', field: 'checkNumber' },
                      { label: 'Bank', field: 'bankName' },
                      { label: 'Memo', field: 'memo' },
                      { label: 'Amount Written', field: 'amountWritten' },
                    ].map(({ label, field }) => {
                      const val = extVal(selected!.extraction, field);
                      const conf = extConf(selected!.extraction, field);
                      if (!val) return null;
                      return (
                        <div key={field} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-xs text-gray-500">{label}</p>
                            <p className="font-medium mt-0.5">{val}</p>
                          </div>
                          {conf > 0 && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                conf >= 0.9
                                  ? 'bg-green-100 text-green-700'
                                  : conf >= 0.7
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {Math.round(conf * 100)}%
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* MICR section */}
                    {selected!.extraction.micr && typeof selected!.extraction.micr === 'object' && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-600 font-semibold uppercase mb-2">MICR Data</p>
                        <div className="space-y-1 text-sm">
                          {selected.extraction.micr.routing?.value && (
                            <p><span className="text-gray-500">Routing:</span> {selected.extraction.micr.routing.value}</p>
                          )}
                          {selected.extraction.micr.account?.value && (
                            <p><span className="text-gray-500">Account:</span> {selected.extraction.micr.account.value}</p>
                          )}
                          {selected.extraction.micr.serial?.value && (
                            <p><span className="text-gray-500">Serial:</span> {selected.extraction.micr.serial.value}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No extraction data available yet</p>
                )}

                <div className="mt-6 pt-4 border-t text-xs text-gray-400">
                  {selected.width > 0 && <p>Dimensions: {selected.width} x {selected.height}px</p>}
                  <p className="mt-1">Use arrow keys to navigate between cheques</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
