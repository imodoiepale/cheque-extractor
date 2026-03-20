'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Upload, Download, Trash2, Eye, X, ChevronRight, ChevronLeft,
  Loader2, AlertCircle, RefreshCw, CheckCircle, Clock, Copy, FileCheck,
  ImageIcon, ExternalLink, RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import ChequeDialog from './components/ChequeDialog';
import DocumentSidebar from './components/DocumentSidebar';
import ConfigureExtractionDialog from './components/ConfigureExtractionDialog';

// ── Types ──────────────────────────────────────────────────
interface JobCheck {
  check_id: string;
  page: number;
  width: number;
  height: number;
  image_file?: string;
  extraction?: any;
  methods_used?: string[];
  engine_results?: Record<string, any>;
  engine_times_ms?: Record<string, number>;
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

function jobExtractionStats(job: Job) {
  const checks = job.checks || [];
  const extracted = checks.filter((c) => c.extraction && Object.keys(c.extraction).length > 0).length;
  const methods = new Set<string>();
  checks.forEach((c) => (c.methods_used || []).forEach((m) => methods.add(m)));
  const byMethod: Record<string, number> = {};
  methods.forEach((m) => {
    byMethod[m] = checks.filter((c) => (c.methods_used || []).includes(m) && c.extraction).length;
  });
  return { extracted, total: job.total_checks, methods: Array.from(methods), byMethod };
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
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; jobId: string | null; message: string }>({ isOpen: false, jobId: null, message: '' });
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);

  // Sidebar filtering state
  const [selectedDocFilter, setSelectedDocFilter] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());

  // Configure extraction dialog
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
  const [configureJob, setConfigureJob] = useState<Job | null>(null);

  // Ensure check dialog closes when PDF opens
  useEffect(() => {
    if (pdfOpen) {
      setSelectedCheckIdx(null);
    }
  }, [pdfOpen]);

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

  const handleDelete = async (jobId: string) => {
    setDeleteModal({
      isOpen: true,
      jobId,
      message: 'Delete this document and all its extracted data? This action cannot be undone.'
    });
  };

  const confirmDelete = async () => {
    if (!deleteModal.jobId) return;
    try {
      const res = await fetch(`/api/jobs/${deleteModal.jobId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setJobs((prev) => prev.filter((j) => j.job_id !== deleteModal.jobId));
      if (selectedJob?.job_id === deleteModal.jobId) { setSelectedJob(null); setSelectedCheckIdx(null); }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRetryFailed = async (jobId: string) => {
    const job = jobs.find((j) => j.job_id === jobId);
    if (job) {
      setConfigureJob(job);
      setConfigureDialogOpen(true);
    }
  };

  const handleReExtract = async (jobId: string) => {
    const job = jobs.find((j) => j.job_id === jobId);
    if (job) {
      setConfigureJob(job);
      setConfigureDialogOpen(true);
    }
  };

  const handleConfigureSubmit = async (config: any) => {
    setReExtracting(true);
    try {
      const res = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Failed to start extraction');
      const methodsParam = config.methods.join(',');
      window.location.href = `/process/${config.job_id}?methods=${methodsParam}`;
    } catch (e: any) {
      setError(e.message);
      setReExtracting(false);
      setConfigureDialogOpen(false);
    }
  };

  const handleToggleStatusFilter = (status: string) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('❌ No session found');
        setJobs([]);
        setLoading(false);
        return;
      }

      console.log('🔍 [Dashboard] Fetching jobs for user:', {
        user_id: session.user.id,
        email: session.user.email,
      });

      const res = await fetch('/api/jobs?source=auto', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      console.log('📡 [Dashboard] API response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('❌ [Dashboard] API error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch jobs');
      }
      const data = await res.json();
      
      console.log('📊 [Dashboard] Received data:', {
        jobs_count: data.jobs?.length || 0,
        total: data.total,
        job_ids: data.jobs?.map((j: any) => j.job_id).slice(0, 5) || [],
      });

      const jobsList = (data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      console.log('✅ [Dashboard] Setting', jobsList.length, 'jobs in state');
      
      setJobs(jobsList);
      setError(null);
    } catch (e: any) {
      console.error('❌ [Dashboard] Error fetching jobs:', e);
      setJobs([]);
      setError(null); // Don't show error for empty results
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    fetchJobs(); 
    
    // Auto-refresh every 10 seconds to show new uploads
    const interval = setInterval(() => {
      fetchJobs();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchJobs]);

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

  // Duplicate detection
  const groupedJobs = jobs.reduce((acc, job) => {
    const key = job.pdf_name.toLowerCase().trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  const duplicateGroups = Object.entries(groupedJobs)
    .filter(([_, jobs]) => jobs.length > 1)
    .map(([name, jobs]) => ({
      name,
      jobs: jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      count: jobs.length
    }));

  const handleDeleteDuplicates = async () => {
    const count = duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0);
    setDeleteModal({
      isOpen: true,
      jobId: 'duplicates',
      message: `Delete ${count} duplicate documents? This will keep the most recent version of each. This action cannot be undone.`
    });
  };

  const confirmDeleteDuplicates = async () => {
    if (deleteModal.jobId !== 'duplicates') return;
    
    setDeletingDuplicates(true);
    try {
      for (const group of duplicateGroups) {
        const toDelete = group.jobs.slice(1);
        for (const job of toDelete) {
          await fetch(`/api/jobs/${job.job_id}`, { method: 'DELETE' });
        }
      }
      await fetchJobs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleConfirmDelete = () => {
    if (deleteModal.jobId === 'duplicates') {
      confirmDeleteDuplicates();
    } else {
      confirmDelete();
    }
  };

  // Filter checks by selected document
  const filteredChecks = useMemo(() => {
    let checks = jobs
      .filter((j) => j.status === 'complete' && j.checks?.length > 0)
      .flatMap((j) =>
        j.checks.map((c) => ({ ...c, job_id: j.job_id, pdf_name: j.pdf_name, job_created: j.created_at }))
      );

    // Filter by selected document
    if (selectedDocFilter) {
      checks = checks.filter((c: any) => c.job_id === selectedDocFilter);
    }

    return checks; // Show all checks, no limit
  }, [jobs, selectedDocFilter]);

  const selectedCheck = selectedCheckIdx !== null && selectedJob ? selectedJob.checks[selectedCheckIdx] : null;

  // Get selected document name for title
  const selectedDocName = selectedDocFilter
    ? jobs.find((j) => j.job_id === selectedDocFilter)?.pdf_name
    : null;

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

      {/* ── Duplicate Warning ──────────────────────── */}
      {!loading && duplicateGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0)} Duplicate Documents Found
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {duplicateGroups.map(g => `${g.name} (${g.count}×)`).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={handleDeleteDuplicates}
            disabled={deletingDuplicates}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-xs font-medium transition disabled:opacity-50"
          >
            {deletingDuplicates ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete Duplicates
          </button>
        </div>
      )}

      {/* ── 2-Column Layout: Sidebar + Main Content ──── */}
      {!loading && jobs.length > 0 && (
        <div className="flex gap-3 h-[calc(100vh-240px)]">
          {/* Left Sidebar */}
          <div className="w-[20%] min-w-[200px]">
            <DocumentSidebar
              jobs={jobs}
              selectedJobId={selectedDocFilter}
              onSelectJob={setSelectedDocFilter}
              statusFilters={statusFilters}
              onToggleStatusFilter={handleToggleStatusFilter}
            />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col">
            {/* Title Bar */}
            <div className="bg-white rounded-t-xl border border-gray-100 px-4 py-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {selectedDocName ? `${selectedDocName}` : 'All Recent Cheques'}
                </h2>
                <p className="text-[10px] text-gray-500">
                  {filteredChecks.length} cheque{filteredChecks.length !== 1 ? 's' : ''}
                  {selectedDocFilter && (() => {
                    const job = jobs.find(j => j.job_id === selectedDocFilter);
                    if (!job) return '';
                    return ` • ${job.total_pages} pages • ${fmtSize(job.file_size)} • ${fmtDate(job.created_at)}`;
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocFilter && (() => {
                  const job = jobs.find(j => j.job_id === selectedDocFilter);
                  if (!job) return null;
                  return (
                    <>
                      <button
                        onClick={() => { 
                          setSelectedCheckIdx(null); // Close check detail dialog if open
                          setSelectedJob(job); 
                          setPdfOpen(true); 
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 rounded transition"
                        title="View PDF"
                      >
                        <ExternalLink size={12} />
                        View PDF
                      </button>
                      <button
                        onClick={() => handleExport(job.job_id, 'csv')}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition"
                        title="Export CSV"
                      >
                        <Download size={12} />
                        Export
                      </button>
                      <button
                        onClick={() => handleReExtract(job.job_id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition"
                        title="Re-extract"
                      >
                        <RotateCcw size={12} />
                        Re-extract
                      </button>
                      <button
                        onClick={() => handleDelete(job.job_id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded transition"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                      <button
                        onClick={() => setSelectedDocFilter(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 ml-2"
                      >
                        Show all
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Checks Table */}
            <div className="flex-1 bg-white rounded-b-xl border-l border-r border-b border-gray-100 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto">
                {filteredChecks.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    No extracted cheques to display
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100 border-b border-gray-200 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">#</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Preview</th>
                        {!selectedDocFilter && (
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Source</th>
                        )}
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Payee</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Check #</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Bank</th>
                        <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Page</th>
                        <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredChecks.map((c: any, idx: number) => {
                        const ext = c.extraction;
                        return (
                          <tr
                            key={`${c.job_id}-${c.check_id}`}
                            className="hover:bg-blue-50/50 cursor-pointer transition"
                            onClick={() => {
                              const job = jobs.find((j) => j.job_id === c.job_id);
                              if (job) {
                                const ci = job.checks.findIndex((ch) => ch.check_id === c.check_id);
                                setPdfOpen(false); // Close PDF dialog if open
                                setSelectedJob(job);
                                setSelectedCheckIdx(ci >= 0 ? ci : 0);
                              }
                            }}
                          >
                            <td className="px-2 py-1.5 text-[10px] font-semibold text-gray-400">{idx + 1}</td>
                            <td className="px-2 py-1.5">
                              <div className="w-12 h-7 bg-gray-100 rounded overflow-hidden">
                                <img
                                  src={`/api/check-image/${c.job_id}/${c.check_id}`}
                                  alt=""
                                  loading="lazy"
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                              </div>
                            </td>
                            {!selectedDocFilter && (
                              <td className="px-2 py-1.5 text-gray-500 text-[11px] truncate max-w-[100px]">{c.pdf_name}</td>
                            )}
                            <td className="px-2 py-1.5 font-medium text-gray-900">{extVal(ext, 'payee') || '—'}</td>
                            <td className="px-2 py-1.5 font-semibold text-emerald-700">{extVal(ext, 'amount') || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{extVal(ext, 'checkDate') || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{extVal(ext, 'checkNumber') || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500 text-[11px]">{extVal(ext, 'bankName') || '—'}</td>
                            <td className="px-2 py-1.5 text-center text-gray-500">{c.page}</td>
                            <td className="px-2 py-1.5 text-center">
                              <button className="text-blue-500 hover:text-blue-700">
                                <Eye size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Old Jobs Table (Hidden, replaced by sidebar) ── */}
      {false && !loading && jobs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Documents</h2>
            <span className="text-[11px] text-gray-400">{jobs.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/50">
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Document</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Pages</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Cheques</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Extracted</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                    <span title="Tesseract OCR">Tess</span>
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                    <span title="NuMarkdown AI">NuMD</span>
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                    <span title="Gemini AI">Gemini</span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {jobs.map((job) => {
                  const stats = jobExtractionStats(job);
                  const pct = stats.total > 0 ? Math.round((stats.extracted / stats.total) * 100) : 0;
                  const tessCount = stats.byMethod['tesseract'] ?? 0;
                  const numdCount = stats.byMethod['numarkdown'] ?? 0;
                  const gemiCount = stats.byMethod['gemini'] ?? 0;
                  const hasTess = stats.methods.includes('tesseract');
                  const hasNumd = stats.methods.includes('numarkdown');
                  const hasGemi = stats.methods.includes('gemini');
                  return (
                  <tr key={job.job_id} className="hover:bg-gray-50/50 transition">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate max-w-[160px]">{job.pdf_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">{statusBadge(job.status)}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{job.total_pages}</td>
                    <td className="px-3 py-3 text-center font-medium text-gray-900">{job.total_checks}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-[12px] font-bold ${pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {stats.extracted}/{stats.total}
                        </span>
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-gray-200'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {hasTess ? (
                        <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold ${tessCount === stats.total ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {tessCount}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {hasNumd ? (
                        <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold ${numdCount === stats.total ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                          {numdCount}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {hasGemi ? (
                        <span className={`inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold ${gemiCount === stats.total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {gemiCount}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-[12px]">{fmtDate(job.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { 
                            setSelectedCheckIdx(null); // Close check detail dialog if open
                            setSelectedJob(job); 
                            setPdfOpen(true); 
                          }}
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
                        {job.status === 'error' && (
                          <button
                            onClick={() => handleRetryFailed(job.job_id)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                            title="Retry Extraction"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {job.status === 'complete' && stats.extracted < stats.total && stats.total > 0 && (
                          <button
                            onClick={() => handleRetryFailed(job.job_id)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                            title={`Retry ${stats.total - stats.extracted} missing`}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(job.job_id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent Cheques Table (removed - replaced by 2-column layout) ─────────────────────── */}
      {false && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Cheques</h2>
            <span className="text-[11px] text-gray-400">Recent cheques</span>
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
                {filteredChecks.map((c: any, idx: number) => {
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
                            loading="lazy"
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
          CHECK DETAIL DIALOG WITH TABS
         ══════════════════════════════════════════════ */}
      {!pdfOpen && selectedCheckIdx !== null && selectedJob && (
        <ChequeDialog
          job={selectedJob}
          selectedCheckIdx={selectedCheckIdx}
          onClose={() => { setSelectedCheckIdx(null); setImageZoom(1); }}
          onNavigate={(idx) => setSelectedCheckIdx(idx)}
          onExport={handleExport}
          onReExtract={handleReExtract}
          reExtracting={reExtracting}
        />
      )}

      {/* PDF Viewer Dialog */}
      {pdfOpen && selectedJob && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setPdfOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-[60vw] h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{selectedJob.pdf_name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedJob.total_pages} pages • {selectedJob.total_checks} checks
                </p>
              </div>
              <button
                onClick={() => setPdfOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090'}/api/jobs/${selectedJob.job_id}/pdf`}
                className="w-full h-full border-0"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Configure Extraction Dialog */}
      {configureJob && (
        <ConfigureExtractionDialog
          job={configureJob}
          isOpen={configureDialogOpen}
          onClose={() => {
            setConfigureDialogOpen(false);
            setConfigureJob(null);
          }}
          onSubmit={handleConfigureSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, jobId: null, message: '' })}
        onConfirm={handleConfirmDelete}
        title="Confirm Delete"
        message={deleteModal.message}
      />
    </div>
  );
}
