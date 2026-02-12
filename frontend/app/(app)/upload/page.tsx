'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DropzoneUpload from './components/DropzoneUpload';
import {
  Upload, FileText, Image as ImageIcon, Loader2, CheckCircle,
  ChevronRight, ChevronLeft, Eye, LayoutGrid, List, ZoomIn, ZoomOut,
  Settings2, Play, X, AlertCircle, HardDrive,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
interface CheckInfo {
  check_id: string;
  page: number;
  width: number;
  height: number;
}

interface AnalyzeResult {
  job_id: string;
  pdf_name: string;
  file_size: number;
  doc_format: string;
  total_pages: number;
  total_checks: number;
  pages: PageInfo[];
  checks: CheckInfo[];
}

interface PageInfo {
  page_number: number;
  width: number;
  height: number;
  checks_on_page: number;
  image_url?: string;
}

type Step = 'upload' | 'preview' | 'configure' | 'starting';
type ViewMode = 'card' | 'table';

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Extraction methods available ───────────────────────────
const EXTRACTION_METHODS = [
  { id: 'ocr', name: 'OCR Engine', desc: 'Tesseract-based text recognition — fast, works offline', icon: '🔍' },
  { id: 'ai', name: 'AI / Gemini', desc: 'AI-powered extraction — higher accuracy on complex checks', icon: '🤖' },
  { id: 'hybrid', name: 'Hybrid (OCR + AI)', desc: 'Run both and merge results for best accuracy', icon: '⚡' },
];

export default function UploadPage() {
  const router = useRouter();

  // ── Step state ───────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Analyze result ───────────────────────────────────────
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  // ── Preview state ────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);

  // ── Extraction config ────────────────────────────────────
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['hybrid']);
  const [pageRangeMode, setPageRangeMode] = useState<'all' | 'custom'>('all');
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);

  // ── Derived ──────────────────────────────────────────────
  const pages = analyzeResult?.pages || [];
  const totalPages = analyzeResult?.total_pages || 0;
  const totalChecks = analyzeResult?.total_checks || 0;

  // ── Handlers ─────────────────────────────────────────────
  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAndAnalyze = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      const file = files[0]; // Process first file
      const formData = new FormData();
      formData.append('file', file);

      // Try the analyze endpoint first, fall back to regular upload
      let data: any;
      try {
        const response = await fetch('/api/upload-analyze', {
          method: 'POST',
          body: formData,
        });
        if (response.ok) {
          data = await response.json();
        } else {
          throw new Error('analyze endpoint unavailable');
        }
      } catch {
        // Fallback: use regular upload
        const formData2 = new FormData();
        formData2.append('file', file);
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData2,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Upload failed');
        }
        data = await response.json();
      }

      // Build analyze result from whatever the backend returned
      const result: AnalyzeResult = {
        job_id: data.job_id || data.id || '',
        pdf_name: data.pdf_name || file.name,
        file_size: data.file_size || file.size || 0,
        doc_format: data.doc_format || 'Auto',
        total_pages: data.total_pages || data.pages?.length || 1,
        total_checks: data.total_checks || data.checks?.length || 0,
        pages: data.pages || Array.from(
          { length: data.total_pages || 1 },
          (_, i) => ({
            page_number: i + 1,
            width: 0,
            height: 0,
            checks_on_page: 0,
          })
        ),
        checks: data.checks || [],
      };

      setAnalyzeResult(result);
      setPageTo(result.total_pages);
      setStep('preview');
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const toggleMethod = (methodId: string) => {
    setSelectedMethods((prev) => {
      if (methodId === 'hybrid') return ['hybrid'];
      const without = prev.filter((m) => m !== 'hybrid' && m !== methodId);
      if (prev.includes(methodId)) {
        return without.length === 0 ? ['hybrid'] : without;
      }
      return [...without, methodId];
    });
  };

  const handleStartExtraction = async () => {
    if (!analyzeResult) return;
    setStep('starting');
    setError(null);

    try {
      const pageRange = pageRangeMode === 'all'
        ? { from: 1, to: totalPages }
        : { from: pageFrom, to: pageTo };

      const response = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: analyzeResult.job_id,
          methods: selectedMethods,
          page_range: pageRange,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start extraction');
      }

      // Navigate to process page with method info in query
      const methodsParam = selectedMethods.join(',');
      router.push(`/process/${analyzeResult.job_id}?methods=${methodsParam}`);
    } catch (err: any) {
      console.error('Start extraction error:', err);
      setError(err.message || 'Failed to start extraction');
      setStep('configure');
    }
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-5 space-y-5">
      {/* ── Step indicator ──────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {(['upload', 'preview', 'configure'] as Step[]).map((s, i) => {
          const labels: Record<string, string> = { upload: 'Upload', preview: 'Preview', configure: 'Extract' };
          const stepNum = i + 1;
          const isCurrent = s === step || (step === 'starting' && s === 'configure');
          const isDone = (['upload', 'preview', 'configure'] as Step[]).indexOf(step === 'starting' ? 'configure' : step) > i;
          return (
            <div key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                isCurrent ? 'bg-gray-900 text-white' :
                isDone ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? <CheckCircle size={12} /> : <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-current flex items-center justify-center text-[9px] font-bold">{stepNum}</span>}
                {labels[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Error banner ────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg flex items-center gap-2 text-[13px]">
          <AlertCircle size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 hover:bg-red-100 rounded"><X size={14} /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 1: UPLOAD
         ══════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Upload Document</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Upload a PDF. We&apos;ll detect pages and cheques before extraction.
            </p>
          </div>

          <DropzoneUpload onFilesSelected={handleFilesSelected} />

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <h3 className="text-[13px] font-semibold text-gray-900">Files ({files.length})</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {files.map((file, index) => (
                    <div key={index} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/50 transition">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-gray-100 rounded">
                          <FileText className="text-gray-500" size={14} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-[13px]">{file.name}</p>
                          <p className="text-[11px] text-gray-400">{fmtSize(file.size)}</p>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveFile(index)} className="p-1 text-gray-300 hover:text-red-500 transition">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFiles([])}
                  className="px-3.5 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-[13px] text-gray-600 transition"
                  disabled={uploading}
                >
                  Clear
                </button>
                <button
                  onClick={handleUploadAndAnalyze}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-[13px] font-medium transition shadow-sm"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload & Analyze
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 2: PREVIEW — show pages, cheque count, images
         ══════════════════════════════════════════════════ */}
      {step === 'preview' && analyzeResult && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Document Preview</h1>
              <p className="text-[13px] text-gray-500 mt-0.5">{analyzeResult.pdf_name}</p>
            </div>
            <button
              onClick={() => setStep('upload')}
              className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition"
            >
              <ChevronLeft size={12} /> Back
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText className="text-blue-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Pages</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{totalPages}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ImageIcon className="text-emerald-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Cheques</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{totalChecks}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <HardDrive className="text-purple-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">File Size</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{fmtSize(analyzeResult.file_size)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Settings2 className="text-amber-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Format</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{analyzeResult.doc_format}</p>
              </div>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Page Previews</h2>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  viewMode === 'card' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid size={12} /> Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List size={12} /> Table
              </button>
            </div>
          </div>

          {/* ── Card View ─────────────────────────────── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pages.map((page) => (
                <div
                  key={page.page_number}
                  onClick={() => setSelectedPage(page.page_number)}
                  className="bg-white rounded-xl border border-gray-100 hover:border-blue-300 hover:shadow-md transition cursor-pointer overflow-hidden group"
                >
                  <div className="aspect-[3/4] bg-gray-50 relative overflow-hidden">
                    <img
                      src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                      alt={`Page ${page.page_number}`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden absolute inset-0 flex items-center justify-center text-gray-300">
                      <FileText size={36} />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-white/90 rounded-full p-1.5 shadow">
                        <Eye size={14} className="text-gray-700" />
                      </div>
                    </div>
                    {/* Page number badge */}
                    <div className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                      {page.page_number}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[12px] text-gray-900">Page {page.page_number}</span>
                      {page.checks_on_page > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                          {page.checks_on_page} cheque{page.checks_on_page > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {page.width > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{page.width} × {page.height}px</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Table View ────────────────────────────── */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Preview</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Page</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Cheques</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Dimensions</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pages.map((page) => (
                    <tr
                      key={page.page_number}
                      className="hover:bg-blue-50/30 cursor-pointer transition"
                      onClick={() => setSelectedPage(page.page_number)}
                    >
                      <td className="px-3 py-2">
                        <div className="w-12 h-16 bg-gray-100 rounded overflow-hidden">
                          <img
                            src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                            alt={`Page ${page.page_number}`}
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">Page {page.page_number}</td>
                      <td className="px-3 py-2">
                        {page.checks_on_page > 0 ? (
                          <span className="text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                            {page.checks_on_page}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-[12px] font-mono">
                        {page.width > 0 ? `${page.width} × ${page.height}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button className="text-blue-500 hover:text-blue-700">
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detected Cheques Preview ──────────────── */}
          {analyzeResult.checks.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Detected Cheques ({analyzeResult.checks.length})</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {analyzeResult.checks.map((check) => (
                  <div key={check.check_id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="aspect-[2/1] bg-gray-50 relative overflow-hidden">
                      <img
                        src={`/api/check-image/${analyzeResult.job_id}/${check.check_id}`}
                        alt={`Cheque ${check.check_id}`}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-gray-900">{check.check_id.replace('_', ' #')}</span>
                      <span className="text-[11px] text-gray-400">Page {check.page} &middot; {check.width}×{check.height}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Continue button */}
          <div className="flex justify-end">
            <button
              onClick={() => setStep('configure')}
              className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-[13px] font-medium transition shadow-sm"
            >
              Configure Extraction
              <ChevronRight size={14} />
            </button>
          </div>

          {/* ── Full-size image modal ─────────────────── */}
          {selectedPage !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedPage(null)}>
              <div
                className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b">
                  <h3 className="text-sm font-semibold text-gray-900">Page {selectedPage} of {totalPages}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom <= 0.25}>
                      <ZoomOut size={14} />
                    </button>
                    <span className="text-[11px] font-medium text-gray-500 min-w-[2.5rem] text-center">{(zoom * 100).toFixed(0)}%</span>
                    <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom >= 3}>
                      <ZoomIn size={14} />
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-1" />
                    <button
                      onClick={() => setSelectedPage(Math.max(1, selectedPage - 1))}
                      disabled={selectedPage <= 1}
                      className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setSelectedPage(Math.min(totalPages, selectedPage + 1))}
                      disabled={selectedPage >= totalPages}
                      className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button onClick={() => { setSelectedPage(null); setZoom(1); }} className="p-1.5 hover:bg-gray-100 rounded ml-1">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-gray-50 flex items-center justify-center">
                  <img
                    src={`/api/page-image/${analyzeResult.job_id}/${selectedPage}`}
                    alt={`Page ${selectedPage}`}
                    className="shadow-lg rounded transition-transform"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', maxWidth: '100%', maxHeight: '75vh' }}
                  />
                </div>
                {(() => {
                  const pg = pages.find((p) => p.page_number === selectedPage);
                  return pg ? (
                    <div className="px-5 py-2.5 border-t bg-white flex items-center justify-between text-[12px] text-gray-500">
                      <span>
                        {pg.checks_on_page > 0
                          ? `${pg.checks_on_page} cheque${pg.checks_on_page > 1 ? 's' : ''} detected`
                          : 'No cheques detected'}
                      </span>
                      {pg.width > 0 && <span className="font-mono text-gray-400">{pg.width} × {pg.height}px</span>}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 3: CONFIGURE EXTRACTION
         ══════════════════════════════════════════════════ */}
      {(step === 'configure' || step === 'starting') && analyzeResult && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Configure Extraction</h1>
              <p className="text-[13px] text-gray-500 mt-0.5">
                {analyzeResult.pdf_name} — {totalPages} pages, {totalChecks} cheques
              </p>
            </div>
            <button
              onClick={() => setStep('preview')}
              disabled={step === 'starting'}
              className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 disabled:opacity-50 transition"
            >
              <ChevronLeft size={12} /> Back
            </button>
          </div>

          {/* Summary bar */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-5 text-[13px]">
            <div className="flex items-center gap-1.5">
              <FileText size={14} className="text-gray-500" />
              <span className="text-gray-600"><strong className="text-gray-900">{totalPages}</strong> pages</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ImageIcon size={14} className="text-gray-500" />
              <span className="text-gray-600"><strong className="text-gray-900">{totalChecks}</strong> cheques</span>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive size={14} className="text-gray-500" />
              <span className="text-gray-600">{fmtSize(analyzeResult.file_size)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Extraction Method Selection ──────────── */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 size={16} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Extraction Method</h2>
              </div>
              <p className="text-[12px] text-gray-400 mb-3">Select which engine(s) to use</p>

              <div className="space-y-2">
                {EXTRACTION_METHODS.map((method) => {
                  const isSelected = selectedMethods.includes(method.id);
                  return (
                    <button
                      key={method.id}
                      onClick={() => toggleMethod(method.id)}
                      disabled={step === 'starting'}
                      className={`w-full text-left p-3 rounded-lg border transition ${
                        isSelected
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{method.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[13px] text-gray-900">{method.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{method.desc}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition flex-shrink-0 ${
                          isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckCircle size={10} className="text-white" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Page Range Selection ─────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Page Range</h2>
              </div>
              <p className="text-[12px] text-gray-400 mb-3">Which pages to extract from</p>

              <div className="space-y-2">
                <button
                  onClick={() => setPageRangeMode('all')}
                  disabled={step === 'starting'}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    pageRangeMode === 'all' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[13px] text-gray-900">All Pages</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Extract from all {totalPages} pages</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${
                      pageRangeMode === 'all' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                      {pageRangeMode === 'all' && <CheckCircle size={10} className="text-white" />}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setPageRangeMode('custom')}
                  disabled={step === 'starting'}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    pageRangeMode === 'custom' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[13px] text-gray-900">Custom Range</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Select specific pages</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center ${
                      pageRangeMode === 'custom' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                      {pageRangeMode === 'custom' && <CheckCircle size={10} className="text-white" />}
                    </div>
                  </div>
                </button>

                {pageRangeMode === 'custom' && (
                  <div className="flex items-center gap-2 pl-3 pt-1">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-0.5">From</label>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={pageFrom}
                        onChange={(e) => setPageFrom(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                        disabled={step === 'starting'}
                        className="w-16 px-2 py-1.5 border rounded-lg text-[13px] disabled:opacity-50"
                      />
                    </div>
                    <span className="text-gray-400 mt-4 text-[12px]">to</span>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-0.5">To</label>
                      <input
                        type="number"
                        min={pageFrom}
                        max={totalPages}
                        value={pageTo}
                        onChange={(e) => setPageTo(Math.max(pageFrom, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                        disabled={step === 'starting'}
                        className="w-16 px-2 py-1.5 border rounded-lg text-[13px] disabled:opacity-50"
                      />
                    </div>
                    <span className="text-[11px] text-gray-400 mt-4">of {totalPages}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Start extraction button */}
          <div className="flex justify-end">
            <button
              onClick={handleStartExtraction}
              disabled={step === 'starting' || selectedMethods.length === 0}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-[13px] font-medium transition shadow-sm"
            >
              {step === 'starting' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Start Extraction
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}