'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FileText, Upload, Download, Trash2, Eye,
  Loader2, AlertCircle, RefreshCw, CheckCircle, FileCheck,
  ImageIcon, ExternalLink, RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import {
  Button, IconButton, Dialog, GlassCard, KpiTile,
  Table, TableScroll, TableShell, Tbody, Td, Th, Thead, Tr,
} from '@/components/ui';
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

/**
 * The cheque list is a DENSE table (text-xs at py-1.5), not the standard
 * text-sm/py-3 one. Density must not regress, so the override lives here once
 * rather than being re-typed per cell — the Th/Td primitives still supply the
 * single header recipe, the hairline borders and the tabular-nums.
 */
const DENSE_CELL = 'px-2 py-1.5';

// ── Helpers ────────────────────────────────────────────────
function extVal(ext: any, field: string): string {
  if (!ext) return '';
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.value || '';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  return '';
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

// ── Component ──────────────────────────────────────────────
export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected job for detail view
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedCheckIdx, setSelectedCheckIdx] = useState<number | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
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

  const handleExport = (jobId: string, format: string) => {
    window.open(`/api/jobs/${jobId}/export?format=${format}`, '_blank');
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
        setJobs([]);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/jobs?source=auto', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch jobs');
      }
      const data = await res.json();

      const jobsList = (data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setJobs(jobsList);
      setError(null);
    } catch (e: any) {
      console.error('[Dashboard] Error fetching jobs:', e);
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

  // Get selected document name for title
  const selectedDocName = selectedDocFilter
    ? jobs.find((j) => j.job_id === selectedDocFilter)?.pdf_name
    : null;

  const colCount = selectedDocFilter ? 9 : 10;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5" data-tone="brand">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink-strong">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Overview of your cheque processing</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton aria-label="Refresh" size="icon-sm" onClick={fetchJobs} title="Refresh">
            <RefreshCw size={16} />
          </IconButton>
          <Link href="/upload" className="inline-flex">
            <Button size="sm" icon={<Upload size={14} />}>Upload</Button>
          </Link>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile tone="brand" label="Documents" value={totalJobs} icon={<FileText size={16} />} loading={loading} />
        <KpiTile tone="brand" label="Total Pages" value={totalPages} icon={<FileCheck size={16} />} loading={loading} />
        <KpiTile tone="success" label="Cheques Found" value={totalChecks} icon={<ImageIcon size={16} />} loading={loading} />
        <KpiTile tone="success" label="Completed" value={completedJobs} icon={<CheckCircle size={16} />} loading={loading} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-ink-faint" size={24} />
        </div>
      )}

      {error && (
        <div className="rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text">
          {error}
        </div>
      )}

      {/* ── Duplicate Warning ──────────────────────── */}
      {!loading && duplicateGroups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning-border bg-warning-bg p-4">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0 text-warning-text" />
            <div>
              <p className="text-sm font-semibold text-warning-text">
                {duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0)} Duplicate Documents Found
              </p>
              <p className="mt-0.5 text-xs text-warning-text/80">
                {duplicateGroups.map(g => `${g.name} (${g.count}×)`).join(', ')}
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteDuplicates}
            loading={deletingDuplicates}
            icon={<Trash2 size={14} />}
          >
            Delete Duplicates
          </Button>
        </div>
      )}

      {/* ── 2-Column Layout: Sidebar + Main Content ──── */}
      {!loading && jobs.length > 0 && (
        <div className="flex flex-col gap-3 lg:h-[calc(100vh-18rem)] lg:flex-row">
          {/* Left Sidebar — ONE blurred container, never one per row. */}
          <div className="lg:w-[22%] lg:min-w-[13rem]">
            <DocumentSidebar
              jobs={jobs}
              selectedJobId={selectedDocFilter}
              onSelectJob={setSelectedDocFilter}
              statusFilters={statusFilters}
              onToggleStatusFilter={handleToggleStatusFilter}
            />
          </div>

          {/* Main Content — one glass card holding header + inset table. */}
          <GlassCard padding="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Title Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-glass-hairline px-4 py-2">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-sm font-semibold text-ink-strong">
                  {selectedDocName ? `${selectedDocName}` : 'All Recent Cheques'}
                </h2>
                <p className="nums text-[11px] text-ink-faint">
                  {filteredChecks.length} cheque{filteredChecks.length !== 1 ? 's' : ''}
                  {selectedDocFilter && (() => {
                    const job = jobs.find(j => j.job_id === selectedDocFilter);
                    if (!job) return '';
                    return ` • ${job.total_pages} pages • ${fmtSize(job.file_size)} • ${fmtDate(job.created_at)}`;
                  })()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedDocFilter && (() => {
                  const job = jobs.find(j => j.job_id === selectedDocFilter);
                  if (!job) return null;
                  return (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-0 px-2.5 py-1 text-xs"
                        icon={<ExternalLink size={12} />}
                        title="View PDF"
                        onClick={() => {
                          setSelectedCheckIdx(null); // Close check detail dialog if open
                          setSelectedJob(job);
                          setPdfOpen(true);
                        }}
                      >
                        View PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-0 px-2.5 py-1 text-xs"
                        icon={<Download size={12} />}
                        title="Export CSV"
                        onClick={() => handleExport(job.job_id, 'csv')}
                      >
                        Export
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-0 px-2.5 py-1 text-xs"
                        icon={<RotateCcw size={12} />}
                        title="Re-extract"
                        onClick={() => handleReExtract(job.job_id)}
                      >
                        Re-extract
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-0 px-2.5 py-1 text-xs text-error-text hover:text-error-dark"
                        icon={<Trash2 size={12} />}
                        title="Delete"
                        onClick={() => handleDelete(job.job_id)}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="link"
                        size="sm"
                        className="min-h-0 px-1 py-1 text-xs"
                        onClick={() => setSelectedDocFilter(null)}
                      >
                        Show all
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Checks Table — inset tier: the card above already blurs. */}
            <TableShell tier="inset" className="flex min-h-0 flex-1 flex-col rounded-none border-0 bg-transparent">
              <TableScroll className="min-h-0 flex-1">
                <Table className="text-xs">
                  <Thead>
                    <tr>
                      <Th className={DENSE_CELL}>#</Th>
                      <Th className={DENSE_CELL}>Preview</Th>
                      {!selectedDocFilter && <Th className={DENSE_CELL}>Source</Th>}
                      <Th className={DENSE_CELL}>Payee</Th>
                      <Th numeric className={DENSE_CELL}>Amount</Th>
                      <Th className={DENSE_CELL}>Date</Th>
                      <Th numeric className={DENSE_CELL}>Check #</Th>
                      <Th className={DENSE_CELL}>Bank</Th>
                      <Th numeric className={DENSE_CELL}>Page</Th>
                      <Th className={`${DENSE_CELL} text-center`}>View</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {filteredChecks.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-16 text-center text-sm text-ink-faint">
                          No extracted cheques to display
                        </td>
                      </tr>
                    ) : filteredChecks.map((c: any, idx: number) => {
                      const ext = c.extraction;
                      return (
                        <Tr
                          key={`${c.job_id}-${c.check_id}`}
                          interactive
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
                          <Td numeric muted className={DENSE_CELL}>{idx + 1}</Td>
                          <Td className={DENSE_CELL}>
                            <div className="h-7 w-12 overflow-hidden rounded-md bg-surface-sunken">
                              <img
                                src={`/api/check-image/${c.job_id}/${c.check_id}`}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          </Td>
                          {!selectedDocFilter && (
                            <Td muted className={`${DENSE_CELL} max-w-[100px] truncate`}>{c.pdf_name}</Td>
                          )}
                          <Td className={`${DENSE_CELL} font-medium`}>{extVal(ext, 'payee') || '—'}</Td>
                          <Td numeric className={`${DENSE_CELL} nums-money font-semibold text-success-text`}>{extVal(ext, 'amount') || '—'}</Td>
                          <Td className={`${DENSE_CELL} nums text-ink-body`}>{extVal(ext, 'checkDate') || '—'}</Td>
                          <Td numeric className={`${DENSE_CELL} text-ink-body`}>{extVal(ext, 'checkNumber') || '—'}</Td>
                          <Td muted className={DENSE_CELL}>{extVal(ext, 'bankName') || '—'}</Td>
                          <Td numeric muted className={DENSE_CELL}>{c.page}</Td>
                          <Td className={`${DENSE_CELL} text-center`}>
                            <span className="inline-flex text-brand hover:text-brand-deep" aria-hidden>
                              <Eye size={12} />
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableScroll>
            </TableShell>
          </GlassCard>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────── */}
      {!loading && jobs.length === 0 && !error && (
        <GlassCard padding="none" className="p-16 text-center">
          <FileText className="mx-auto mb-3 text-ink-faint/60" size={40} />
          <h3 className="font-heading text-base font-semibold text-ink-strong">No documents yet</h3>
          <p className="mb-5 mt-1 text-sm text-ink-body">Upload a PDF to get started</p>
          <Link href="/upload" className="inline-flex">
            <Button icon={<Upload size={14} />}>Upload PDF</Button>
          </Link>
        </GlassCard>
      )}

      {/* ══════════════════════════════════════════════
          CHECK DETAIL DIALOG WITH TABS
         ══════════════════════════════════════════════ */}
      {!pdfOpen && selectedCheckIdx !== null && selectedJob && (
        <ChequeDialog
          job={selectedJob}
          selectedCheckIdx={selectedCheckIdx}
          onClose={() => setSelectedCheckIdx(null)}
          onNavigate={(idx) => setSelectedCheckIdx(idx)}
          onExport={handleExport}
          onReExtract={handleReExtract}
          reExtracting={reExtracting}
        />
      )}

      {/* PDF Viewer Dialog */}
      {pdfOpen && selectedJob && (
        <Dialog
          open={pdfOpen}
          onClose={() => setPdfOpen(false)}
          size="full"
          title={selectedJob.pdf_name}
          description={`${selectedJob.total_pages} pages • ${selectedJob.total_checks} checks`}
          className="flex h-[90vh] flex-col"
        >
          <div className="h-[calc(90vh-7rem)] overflow-hidden rounded-card border border-glass-hairline bg-surface-sunken">
            <iframe
              src={`/api/pdf-file/${selectedJob.job_id}`}
              className="h-full w-full border-0"
              title="PDF Viewer"
            />
          </div>
        </Dialog>
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
