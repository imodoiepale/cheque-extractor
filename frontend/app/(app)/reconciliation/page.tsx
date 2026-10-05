'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle, AlertTriangle, Copy, Eye, Search,
  Loader2, RefreshCw, ArrowLeft, ChevronLeft, ChevronRight,
  Flag, X, FileText, ThumbsUp, RotateCcw,
} from 'lucide-react';
import {
  Badge,
  Button,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  IconButton,
  Input,
  Select,
  Table,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';

// ── Types ──────────────────────────────────────────────────
interface JobCheck {
  check_id: string;
  page: number;
  extraction?: any;
  methods_used?: string[];
}

interface Job {
  job_id: string;
  status: string;
  pdf_name: string;
  total_pages: number;
  total_checks: number;
  checks: JobCheck[];
  created_at: string;
}

/**
 * This grid ran `px-3 py-2.5` at 13px before the redesign — about a 40px row,
 * where the shared `tdVariants` recipe (px-4 py-3 at 14px) is about 44px.
 * Adopting the shared recipe wholesale would cost roughly one row in every
 * eleven on a reviewer's screen, so the density is declared ONCE here instead
 * of editing the primitive, exactly as parcel E's DENSE_GRID does.
 */
const DENSE_RECON = '[&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3';

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

/** Confidence is a state, so it reads off the state tokens, never a raw palette. */
function confColor(conf: number): string {
  if (conf >= 0.9) return 'text-success-text';
  if (conf >= 0.7) return 'text-info-text';
  if (conf >= 0.5) return 'text-warning-text';
  return 'text-error-text';
}

function confTone(conf: number) {
  if (conf >= 0.9) return 'success' as const;
  if (conf >= 0.7) return 'brand' as const;
  if (conf >= 0.5) return 'warning' as const;
  return 'error' as const;
}

// ── Wrapper with Suspense ──────────────────────────────────
export default function ReconciliationPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    }>
      <ReconciliationContent />
    </Suspense>
  );
}

// ── Component ──────────────────────────────────────────────
function ReconciliationContent() {
  const searchParams = useSearchParams();
  const jobIdParam = searchParams?.get('job') ?? null;
  const checkIdParam = searchParams?.get('check') ?? null;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobIdParam);
  const [selectedCheckIdx, setSelectedCheckIdx] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'matched' | 'review' | 'mismatch'>('all');

  // Action states
  const [actionStates, setActionStates] = useState<Record<string, 'confirmed' | 'flagged' | 'duplicate' | null>>({});

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const jobsList = (data.jobs || [])
        .filter((j: Job) => j.status === 'complete' && j.checks?.length > 0)
        .sort((a: Job, b: Job) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setJobs(jobsList);

      // Auto-select job from URL param
      if (jobIdParam && jobsList.find((j: Job) => j.job_id === jobIdParam)) {
        setSelectedJobId(jobIdParam);
        if (checkIdParam) {
          const job = jobsList.find((j: Job) => j.job_id === jobIdParam);
          const idx = job?.checks.findIndex((c: JobCheck) => c.check_id === checkIdParam);
          if (idx !== undefined && idx >= 0) setSelectedCheckIdx(idx);
        }
      }
    } catch (e) {
      console.error('Failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  }, [jobIdParam, checkIdParam]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const selectedJob = jobs.find(j => j.job_id === selectedJobId) || null;
  const selectedCheck = selectedJob?.checks[selectedCheckIdx] || null;

  // ── Build reconciliation rows for the table view ───────
  const reconciliationRows = useMemo(() => {
    if (!selectedJob) return [];
    return (selectedJob.checks || []).map((check, idx) => {
      const ext = check.extraction;
      const avgConf = ext
        ? ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(ext, f), 0) / 4
        : 0;

      let status: 'matched' | 'review' | 'mismatch' = 'mismatch';
      if (avgConf > 0.8) status = 'matched';
      else if (avgConf > 0.5) status = 'review';

      const actionState = actionStates[`${selectedJob.job_id}-${check.check_id}`];

      return {
        idx,
        check,
        checkNumber: extVal(ext, 'checkNumber') || '—',
        payee: extVal(ext, 'payee') || '—',
        amount: extVal(ext, 'amount') || '—',
        date: extVal(ext, 'checkDate') || '—',
        status,
        confidence: Math.round(avgConf * 100),
        actionState,
      };
    }).filter(row => {
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return row.checkNumber.toLowerCase().includes(q) ||
          row.payee.toLowerCase().includes(q) ||
          row.amount.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedJob, filterStatus, searchQuery, actionStates]);

  // ── Action handlers ────────────────────────────────────
  const handleAction = (checkId: string, action: 'confirmed' | 'flagged' | 'duplicate' | null) => {
    if (!selectedJob) return;
    const key = `${selectedJob.job_id}-${checkId}`;
    setActionStates(prev => ({ ...prev, [key]: action }));
  };

  // ── Status badge. Mapped once; no page invents a status colour. ────
  const statusBadge = (status: string, actionState?: string | null) => {
    if (actionState === 'confirmed') {
      return <Badge tone="success" size="sm"><CheckCircle size={10} /> Confirmed</Badge>;
    }
    if (actionState === 'flagged') {
      return <Badge tone="warning" size="sm"><Flag size={10} /> Flagged</Badge>;
    }
    if (actionState === 'duplicate') {
      return <Badge tone="error" size="sm"><Copy size={10} /> Duplicate</Badge>;
    }
    if (status === 'matched') return <Badge tone="success" size="sm"><CheckCircle size={10} /> Matched</Badge>;
    if (status === 'review') return <Badge tone="warning" size="sm"><AlertTriangle size={10} /> Review</Badge>;
    return <Badge tone="error" size="sm"><X size={10} /> Mismatch</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-5">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/firm-dashboard" aria-label="Back to firm dashboard" className="rounded-input p-1.5 text-ink-faint transition-colors hover:bg-brand/[0.08] hover:text-brand-deep">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Reconciliation</h1>
            <p className="mt-0.5 text-sm text-ink-body">Compare OCR extractions with QuickBooks data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="text"
              placeholder="Search checks..."
              aria-label="Search checks"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 pl-10"
            />
          </div>
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            aria-label="Filter by status"
            className="w-40"
          >
            <option value="all">All Status</option>
            <option value="matched">Matched</option>
            <option value="review">Review</option>
            <option value="mismatch">Mismatch</option>
          </Select>
          <IconButton aria-label="Refresh" onClick={fetchJobs}>
            <RefreshCw size={16} />
          </IconButton>
        </div>
      </div>

      {/* ── Job Selector ────────────────────────────── */}
      {!selectedJobId && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="border-b border-glass-hairline px-5 py-3.5">
            <GlassCardTitle className="text-sm">Select a Document to Reconcile</GlassCardTitle>
          </div>
          <div className="glass-divider">
            {jobs.map(job => (
              <button
                key={job.job_id}
                onClick={() => { setSelectedJobId(job.job_id); setSelectedCheckIdx(0); }}
                className="press flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-brand/[0.045]"
              >
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-ink-faint" />
                  <div>
                    <p className="text-sm font-medium text-ink-strong">{job.pdf_name}</p>
                    <p className="nums text-xs text-ink-faint">{job.total_checks} checks &middot; {job.total_pages} pages</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-ink-faint" />
              </button>
            ))}
            {jobs.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-ink-faint">
                No completed documents available for reconciliation.
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* ── Reconciliation Table ────────────────────── */}
      {selectedJob && (
        <>
          {/* Job header */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => { setSelectedJobId(null); setSelectedCheckIdx(0); }}
              className="flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
            >
              <ArrowLeft size={12} /> All Documents
            </button>
            <span className="text-ink-faint">&middot;</span>
            <span className="text-sm font-medium text-ink-strong">{selectedJob.pdf_name}</span>
            <span className="nums text-xs text-ink-faint">{selectedJob.total_checks} checks</span>
          </div>

          <div className="grid grid-cols-12 gap-5">
            {/* ── Table (left) ──────────────────────── */}
            <div className="col-span-12 lg:col-span-7">
              <GlassCard padding="none" className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-glass-hairline px-5 py-3">
                  <GlassCardTitle className="text-sm">Reconciliation</GlassCardTitle>
                  <span className="nums text-xs text-ink-faint">{reconciliationRows.length} items</span>
                </div>
                {/* One scroll container. The page does not scroll behind it. */}
                <TableScroll className="max-h-[calc(100vh-18rem)]">
                  <Table className={DENSE_RECON}>
                    <Thead>
                      <Tr>
                        <Th>Check #</Th>
                        <Th>Payee</Th>
                        <Th numeric>Amount</Th>
                        <Th numeric>Date</Th>
                        <Th>Status</Th>
                        <Th numeric>Conf.</Th>
                        <Th>Action</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {reconciliationRows.map((row) => (
                        <Tr
                          key={row.check.check_id}
                          interactive
                          selected={selectedCheckIdx === row.idx}
                          onClick={() => setSelectedCheckIdx(row.idx)}
                        >
                          <Td className="nums font-mono text-ink-body">{row.checkNumber}</Td>
                          <Td className="max-w-[140px] truncate font-medium">{row.payee}</Td>
                          <Td numeric className="nums-money font-medium">{row.amount}</Td>
                          <Td numeric muted>{row.date}</Td>
                          <Td>{statusBadge(row.status, row.actionState)}</Td>
                          <Td numeric>
                            <Badge tone={confTone(row.confidence / 100)} size="sm" className="nums">
                              {row.confidence}
                            </Badge>
                          </Td>
                          <Td>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(row.check.check_id, 'confirmed'); }}
                                className={`press rounded-input p-1 transition-colors ${row.actionState === 'confirmed' ? 'bg-success-bg text-success-text' : 'text-ink-faint hover:bg-success-bg hover:text-success-text'}`}
                                title="Confirm Match"
                                aria-label="Confirm match"
                              >
                                <ThumbsUp size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(row.check.check_id, 'duplicate'); }}
                                className={`press rounded-input p-1 transition-colors ${row.actionState === 'duplicate' ? 'bg-error-bg text-error-text' : 'text-ink-faint hover:bg-error-bg hover:text-error-text'}`}
                                title="Mark Duplicate"
                                aria-label="Mark duplicate"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableScroll>
              </GlassCard>
            </div>

            {/* ── Detail Panel (right) ──────────────── */}
            <div className="col-span-12 space-y-4 lg:col-span-5">
              {selectedCheck && selectedCheck.extraction ? (
                <>
                  {/* Check Image */}
                  <GlassCard padding="none" className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-glass-hairline px-4 py-2.5">
                      <span className="nums text-xs font-medium text-ink-body">
                        Check {selectedCheckIdx + 1} of {selectedJob.checks.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedCheckIdx(Math.max(0, selectedCheckIdx - 1))}
                          disabled={selectedCheckIdx === 0}
                          aria-label="Previous check"
                          className="press rounded-input p-1 text-ink-body hover:bg-brand/[0.08] disabled:opacity-disabled"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => setSelectedCheckIdx(Math.min(selectedJob.checks.length - 1, selectedCheckIdx + 1))}
                          disabled={selectedCheckIdx === selectedJob.checks.length - 1}
                          aria-label="Next check"
                          className="press rounded-input p-1 text-ink-body hover:bg-brand/[0.08] disabled:opacity-disabled"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                    {/* A recessed track behind the scan, not a second glass pane. */}
                    <div className="glass-track flex items-center justify-center rounded-none p-3">
                      <img
                        src={`/api/check-image/${selectedJob.job_id}/${selectedCheck.check_id}`}
                        alt="Check image"
                        className="max-h-[160px] rounded-input object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  </GlassCard>

                  {/* Side-by-side OCR vs QBO Data */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* OCR Data */}
                    <GlassCard padding="none" className="overflow-hidden">
                      <div className="border-b border-glass-hairline bg-info-bg/50 px-3 py-2">
                        <h3 className="text-xs font-semibold text-info-text">OCR Data</h3>
                      </div>
                      <div className="space-y-2 p-3">
                        {[
                          { label: 'Check #', field: 'checkNumber' },
                          { label: 'Payee', field: 'payee' },
                          { label: 'Date', field: 'checkDate' },
                          { label: 'Amount', field: 'amount' },
                          { label: 'Bank', field: 'bankName' },
                          { label: 'Memo', field: 'memo' },
                        ].map(({ label, field }) => (
                          <div key={field}>
                            <p className="text-eyebrow text-ink-faint">{label}</p>
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-medium text-ink-strong">{extVal(selectedCheck.extraction, field) || '—'}</p>
                              {extConf(selectedCheck.extraction, field) > 0 && (
                                <span className={`nums shrink-0 text-xs font-semibold ${confColor(extConf(selectedCheck.extraction, field))}`}>
                                  {Math.round(extConf(selectedCheck.extraction, field) * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </GlassCard>

                    {/* QBO Data (placeholder until connected) */}
                    <GlassCard padding="none" className="overflow-hidden">
                      <div className="border-b border-glass-hairline bg-success-bg/50 px-3 py-2">
                        <h3 className="text-xs font-semibold text-success-text">QBO Data</h3>
                      </div>
                      <div className="space-y-2 p-3">
                        {[
                          { label: 'TxnNumber', value: extVal(selectedCheck.extraction, 'checkNumber') || '—' },
                          { label: 'TxnDesc', value: extVal(selectedCheck.extraction, 'payee') || '—' },
                          { label: 'TxnDate', value: extVal(selectedCheck.extraction, 'checkDate') || '—' },
                          { label: 'Amount', value: extVal(selectedCheck.extraction, 'amount') || '—' },
                          { label: 'Account', value: 'Checking' },
                          { label: 'Memo', value: extVal(selectedCheck.extraction, 'memo') || '—' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-eyebrow text-ink-faint">{label}</p>
                            <p className="truncate text-xs font-medium text-ink-strong">{value}</p>
                          </div>
                        ))}
                      </div>
                    </GlassCard>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      icon={<CheckCircle size={14} />}
                      onClick={() => handleAction(selectedCheck.check_id, 'confirmed')}
                    >
                      Confirm Match
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      icon={<Copy size={14} />}
                      onClick={() => handleAction(selectedCheck.check_id, 'duplicate')}
                    >
                      Mark Duplicate
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 text-warning-text"
                      icon={<Flag size={13} />}
                      onClick={() => handleAction(selectedCheck.check_id, 'flagged')}
                    >
                      Flag for Review
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      icon={<RotateCcw size={13} />}
                      onClick={() => handleAction(selectedCheck.check_id, null)}
                    >
                      Reset
                    </Button>
                  </div>

                  {/* Audit Trail for this check */}
                  <GlassCard padding="none" className="overflow-hidden">
                    <div className="border-b border-glass-hairline px-4 py-2.5">
                      <h3 className="text-xs font-semibold text-ink-body">Audit Log</h3>
                    </div>
                    <div className="glass-divider">
                      <div className="flex items-center gap-2 px-4 py-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-success" />
                        <span className="nums text-xs text-ink-faint">
                          {new Date(selectedJob.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-xs font-medium text-ink-body">OCR Extracted Data</span>
                      </div>
                      {selectedCheck.methods_used?.map(method => (
                        <div key={method} className="flex items-center gap-2 px-4 py-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-brand" />
                          <span className="text-xs text-ink-faint">Engine</span>
                          <span className="text-xs font-medium capitalize text-ink-body">{method}</span>
                        </div>
                      ))}
                      {actionStates[`${selectedJob.job_id}-${selectedCheck.check_id}`] && (
                        <div className="flex items-center gap-2 px-4 py-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-brand-deep" />
                          <span className="text-xs text-ink-faint">Now</span>
                          <span className="text-xs font-medium capitalize text-ink-body">
                            {actionStates[`${selectedJob.job_id}-${selectedCheck.check_id}`]}
                          </span>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </>
              ) : (
                <GlassCard padding="lg" className="text-center">
                  <Eye size={24} className="mx-auto mb-2 text-ink-faint" />
                  <p className="text-sm text-ink-body">Select a check from the table to view details</p>
                </GlassCard>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
