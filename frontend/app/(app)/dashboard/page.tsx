'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Upload, FileText, Image as ImageIcon, CheckCircle, Clock,
  Loader2, Eye, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  FileCheck, Download, ExternalLink, AlertCircle, RefreshCw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
interface JobCheck {
  check_id: string;
  page: number;
  width: number;
  height: number;
  image_file?: string;
  extraction?: any;
}

interface Job {
  job_id: string;
  status: string;
  pdf_name: string;
  file_size?: number;
  doc_format?: string;
  total_pages: number;
  total_checks: number;
  checks: JobCheck[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

// ── Helpers ────────────────────────────────────────────────
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

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; icon: any }> = {
    complete: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle size={12} /> },
    analyzed: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', icon: <Eye size={12} /> },
    pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: <Clock size={12} /> },
    extracting: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: <Loader2 size={12} className="animate-spin" /> },
    ocr_running: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: <Loader2 size={12} className="animate-spin" /> },
    error: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: <AlertCircle size={12} /> },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${s.bg} ${s.text}`}>
      {s.icon} {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────
export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected job for detail view
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCheckIdx, setSelectedCheckIdx] = useState<number | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);

  const EXPORT_FORMATS = [
    { id: 'csv', name: 'Generic CSV', desc: 'Excel, Google Sheets' },
    { id: 'iif', name: 'QuickBooks Desktop', desc: 'IIF format' },
    { id: 'qbo', name: 'QuickBooks Online', desc: 'CSV bank import' },
    { id: 'xero', name: 'Xero', desc: 'Bank statement CSV' },
    { id: 'zoho', name: 'Zoho Books', desc: 'Bank statement CSV' },
    { id: 'sage', name: 'Sage', desc: 'Accounting CSV' },
  ];

  const handleExport = (jobId: string, format: string) => {
    window.open(`/api/jobs/${jobId}/export?format=${format}`, '_blank');
    setExportDropdownOpen(false);
  };

  const handleReExtract = async (jobId: string) => {
    setReExtracting(true);
    try {
      const res = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, methods: ['hybrid'], force: true }),
      });
      if (!res.ok) throw new Error('Failed to start re-extraction');
      // Redirect to process page to watch progress
      window.location.href = `/process/${jobId}?methods=hybrid`;
    } catch (e: any) {
      setError(e.message);
      setReExtracting(false);
    }
  };

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const jobsList = (data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setJobs(jobsList);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Keyboard navigation for check detail
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedCheckIdx === null || !selectedJob) return;
      const max = selectedJob.checks.length - 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCheckIdx((p) => (p !== null && p > 0 ? p - 1 : p));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCheckIdx((p) => (p !== null && p < max ? p + 1 : p));
      } else if (e.key === 'Escape') {
        setSelectedCheckIdx(null);
        setPdfOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCheckIdx, selectedJob]);

  // Derived stats
  const totalJobs = jobs.length;
  const totalChecks = jobs.reduce((s, j) => s + (j.total_checks || 0), 0);
  const completedJobs = jobs.filter((j) => j.status === 'complete').length;
  const totalPages = jobs.reduce((s, j) => s + (j.total_pages || 0), 0);

  // All checks flattened for "Recent Cheques" table
  const allChecks = jobs
    .filter((j) => j.status === 'complete' && j.checks?.length > 0)
    .flatMap((j) =>
      j.checks.map((c) => ({ ...c, job_id: j.job_id, pdf_name: j.pdf_name, job_created: j.created_at }))
    )
    .slice(0, 50);

  const selectedCheck = selectedCheckIdx !== null && selectedJob ? selectedJob.checks[selectedCheckIdx] : null;

  return (
    <div className="max-w-7xl mx-auto p-5 space-y-5">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Overview of your cheque processing</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <Link
            href="/upload"
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-[13px] font-medium transition shadow-sm"
          >
            <Upload size={14} />
            Upload
          </Link>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Documents', value: totalJobs, icon: <FileText size={16} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Total Pages', value: totalPages, icon: <FileCheck size={16} className="text-indigo-500" />, bg: 'bg-indigo-50' },
          { label: 'Cheques Found', value: totalChecks, icon: <ImageIcon size={16} className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Completed', value: completedJobs, icon: <CheckCircle size={16} className="text-purple-500" />, bg: 'bg-purple-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}>{s.icon}</div>
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{s.label}</p>
              <p className="text-xl font-semibold text-gray-900 -mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-gray-400" size={24} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── Jobs Table ──────────────────────────────── */}
      {!loading && jobs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Documents</h2>
            <span className="text-[11px] text-gray-400">{jobs.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Document</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Pages</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Cheques</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Format</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => (
                  <tr key={job.job_id} className="hover:bg-gray-50/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate max-w-[180px]">{job.pdf_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(job.status)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{job.total_pages}</td>
                    <td className="px-4 py-3 text-center font-medium text-gray-900">{job.total_checks}</td>
                    <td className="px-4 py-3 text-gray-500 text-[12px]">{job.doc_format || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-[12px]">{fmtSize(job.file_size)}</td>
                    <td className="px-4 py-3 text-gray-500 text-[12px]">{fmtDate(job.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setSelectedJob(job); setPdfOpen(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="View PDF"
                        >
                          <ExternalLink size={14} />
                        </button>
                        {job.status === 'complete' && job.checks?.length > 0 && (
                          <>
                            <button
                              onClick={() => { setSelectedJob(job); setSelectedCheckIdx(0); }}
                              className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                              title="View Cheques"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => handleExport(job.job_id, 'csv')}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                              title="Export CSV"
                            >
                              <Download size={14} />
                            </button>
                          </>
                        )}
                        {(job.status === 'pending' || job.status === 'extracting' || job.status === 'ocr_running') && (
                          <Link
                            href={`/process/${job.job_id}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                            title="View Progress"
                          >
                            <Loader2 size={14} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent Cheques Table ─────────────────────── */}
      {!loading && allChecks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Cheques</h2>
            <span className="text-[11px] text-gray-400">{allChecks.length} cheques</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Preview</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Source</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Payee</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Check #</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Bank</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Page</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {allChecks.map((c: any, idx: number) => {
                  const ext = c.extraction;
                  return (
                    <tr
                      key={`${c.job_id}-${c.check_id}`}
                      className="hover:bg-blue-50/30 cursor-pointer transition"
                      onClick={() => {
                        const job = jobs.find((j) => j.job_id === c.job_id);
                        if (job) {
                          const ci = job.checks.findIndex((ch) => ch.check_id === c.check_id);
                          setSelectedJob(job);
                          setSelectedCheckIdx(ci >= 0 ? ci : 0);
                        }
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="w-16 h-10 bg-gray-100 rounded overflow-hidden">
                          <img
                            src={`/api/check-image/${c.job_id}/${c.check_id}`}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-[12px] truncate max-w-[120px]">{c.pdf_name}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{extVal(ext, 'payee') || '—'}</td>
                      <td className="px-3 py-2 font-medium text-emerald-700">{extVal(ext, 'amount') || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{extVal(ext, 'checkDate') || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{extVal(ext, 'checkNumber') || '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-[12px]">{extVal(ext, 'bankName') || '—'}</td>
                      <td className="px-3 py-2 text-center text-gray-500">{c.page}</td>
                      <td className="px-3 py-2 text-center">
                        <button className="text-blue-500 hover:text-blue-700">
                          <Eye size={14} />
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

      {/* ── Empty state ─────────────────────────────── */}
      {!loading && jobs.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
          <FileText className="mx-auto text-gray-300 mb-3" size={40} />
          <h3 className="text-base font-semibold text-gray-700">No documents yet</h3>
          <p className="text-[13px] text-gray-400 mt-1 mb-4">Upload a PDF to get started</p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-[13px] font-medium hover:bg-gray-800 transition"
          >
            <Upload size={14} /> Upload PDF
          </Link>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          PDF IFRAME VIEWER
         ══════════════════════════════════════════════ */}
      {pdfOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPdfOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-5xl h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">{selectedJob.pdf_name}</h3>
                <span className="text-[11px] text-gray-400">{selectedJob.total_pages} pages</span>
              </div>
              <button onClick={() => setPdfOpen(false)} className="p-1.5 hover:bg-gray-100 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={`/api/pdf-file/${selectedJob.job_id}`}
                className="w-full h-full border-0"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          CHECK DETAIL NAVIGATOR
         ══════════════════════════════════════════════ */}
      {selectedCheck && selectedCheckIdx !== null && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setSelectedCheckIdx(null); setImageZoom(1); }}>
          <div
            className="bg-white rounded-xl shadow-2xl w-[92vw] max-w-5xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  Cheque {selectedCheckIdx + 1} of {selectedJob.checks.length}
                </h3>
                <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{selectedJob.pdf_name}</span>
                <span className="text-[11px] text-gray-400">Page {selectedCheck.page}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Export dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                  >
                    <Download size={13} />
                    Export
                  </button>
                  {exportDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border z-50 py-1">
                      {EXPORT_FORMATS.map((fmt) => (
                        <button
                          key={fmt.id}
                          onClick={() => handleExport(selectedJob.job_id, fmt.id)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition"
                        >
                          <p className="text-[12px] font-medium text-gray-900">{fmt.name}</p>
                          <p className="text-[10px] text-gray-400">{fmt.desc}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Re-extract button */}
                <button
                  onClick={() => handleReExtract(selectedJob.job_id)}
                  disabled={reExtracting}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition disabled:opacity-50"
                  title="Re-extract with all methods"
                >
                  {reExtracting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Re-extract
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={imageZoom <= 0.5}>
                  <ZoomOut size={14} />
                </button>
                <span className="text-[11px] text-gray-500 min-w-[2rem] text-center">{(imageZoom * 100).toFixed(0)}%</span>
                <button onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={imageZoom >= 3}>
                  <ZoomIn size={14} />
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button
                  onClick={() => { setSelectedCheckIdx(Math.max(0, selectedCheckIdx - 1)); setImageZoom(1); }}
                  disabled={selectedCheckIdx === 0}
                  className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[12px] text-gray-500">{selectedCheckIdx + 1}/{selectedJob.checks.length}</span>
                <button
                  onClick={() => { setSelectedCheckIdx(Math.min(selectedJob.checks.length - 1, selectedCheckIdx + 1)); setImageZoom(1); }}
                  disabled={selectedCheckIdx === selectedJob.checks.length - 1}
                  className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => { setSelectedCheckIdx(null); setImageZoom(1); setExportDropdownOpen(false); }} className="p-1.5 hover:bg-gray-100 rounded ml-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Image */}
              <div className="w-1/2 flex items-center justify-center bg-gray-50 border-r overflow-auto p-4">
                <img
                  src={`/api/check-image/${selectedJob.job_id}/${selectedCheck.check_id}`}
                  alt=""
                  className="rounded shadow-lg transition-transform"
                  style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center', maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain' }}
                />
              </div>
              {/* Data */}
              <div className="w-1/2 p-5 overflow-y-auto">
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Extracted Data</h4>
                {selectedCheck.extraction ? (
                  <div className="space-y-2">
                    {[
                      { label: 'Payee', field: 'payee' },
                      { label: 'Amount', field: 'amount' },
                      { label: 'Date', field: 'checkDate' },
                      { label: 'Check #', field: 'checkNumber' },
                      { label: 'Bank', field: 'bankName' },
                      { label: 'Memo', field: 'memo' },
                    ].map(({ label, field }) => {
                      const val = extVal(selectedCheck.extraction, field);
                      const conf = extConf(selectedCheck.extraction, field);
                      if (!val) return null;
                      return (
                        <div key={field} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-[11px] text-gray-400">{label}</p>
                            <p className="text-[13px] font-medium text-gray-900">{val}</p>
                          </div>
                          {conf > 0 && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                              conf >= 0.9 ? 'bg-emerald-100 text-emerald-700' :
                              conf >= 0.7 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(conf * 100)}%
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {selectedCheck.extraction.micr && typeof selectedCheck.extraction.micr === 'object' && (
                      <div className="mt-3 p-2.5 bg-sky-50 rounded-lg">
                        <p className="text-[11px] text-sky-600 font-semibold uppercase mb-1.5">MICR</p>
                        <div className="space-y-0.5 text-[12px]">
                          {selectedCheck.extraction.micr.routing?.value && (
                            <p><span className="text-gray-400">Routing:</span> {selectedCheck.extraction.micr.routing.value}</p>
                          )}
                          {selectedCheck.extraction.micr.account?.value && (
                            <p><span className="text-gray-400">Account:</span> {selectedCheck.extraction.micr.account.value}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-gray-400">No extraction data</p>
                )}
                <div className="mt-4 pt-3 border-t text-[11px] text-gray-400">
                  {selectedCheck.width > 0 && <p>{selectedCheck.width} × {selectedCheck.height}px</p>}
                  <p className="mt-0.5">← → arrow keys to navigate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
