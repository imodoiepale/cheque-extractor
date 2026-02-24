'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle, AlertTriangle, Copy, Eye, Search,
  Loader2, RefreshCw, ArrowLeft, ChevronLeft, ChevronRight,
  Flag, ShieldCheck, X, Filter, FileText, ArrowRight,
  ThumbsUp, ThumbsDown, RotateCcw,
} from 'lucide-react';

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

function confColor(conf: number): string {
  if (conf >= 0.9) return 'text-emerald-600';
  if (conf >= 0.7) return 'text-blue-600';
  if (conf >= 0.5) return 'text-amber-600';
  return 'text-red-600';
}

function confBg(conf: number): string {
  if (conf >= 0.9) return 'bg-emerald-50 border-emerald-200';
  if (conf >= 0.7) return 'bg-blue-50 border-blue-200';
  if (conf >= 0.5) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

// ── Wrapper with Suspense ──────────────────────────────────
export default function ReconciliationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');

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

  // ── Status badge ───────────────────────────────────────
  const statusBadge = (status: string, actionState?: string | null) => {
    if (actionState === 'confirmed') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[11px] font-medium"><CheckCircle size={10} /> Confirmed</span>;
    }
    if (actionState === 'flagged') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[11px] font-medium"><Flag size={10} /> Flagged</span>;
    }
    if (actionState === 'duplicate') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[11px] font-medium"><Copy size={10} /> Duplicate</span>;
    }
    const config: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      matched: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <CheckCircle size={10} />, label: 'Matched' },
      review: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <AlertTriangle size={10} />, label: 'Review' },
      mismatch: { bg: 'bg-red-50', text: 'text-red-700', icon: <X size={10} />, label: 'Mismatch' },
    };
    const c = config[status] || config.mismatch;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${c.bg} ${c.text} rounded-full text-[11px] font-medium`}>{c.icon} {c.label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto p-5 space-y-5">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/firm-dashboard" className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reconciliation</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Compare OCR extractions with QuickBooks data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search checks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-48"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white"
          >
            <option value="all">All Status</option>
            <option value="matched">Matched</option>
            <option value="review">Review</option>
            <option value="mismatch">Mismatch</option>
          </select>
          <button onClick={fetchJobs} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Job Selector ────────────────────────────── */}
      {!selectedJobId && (
        <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Select a Document to Reconcile</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {jobs.map(job => (
              <button
                key={job.job_id}
                onClick={() => { setSelectedJobId(job.job_id); setSelectedCheckIdx(0); }}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-gray-400" />
                  <div>
                    <p className="text-[13px] font-medium text-gray-900">{job.pdf_name}</p>
                    <p className="text-[11px] text-gray-500">{job.total_checks} checks · {job.total_pages} pages</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            ))}
            {jobs.length === 0 && (
              <div className="px-5 py-12 text-center text-gray-400 text-[13px]">
                No completed documents available for reconciliation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Reconciliation Table ────────────────────── */}
      {selectedJob && (
        <>
          {/* Job header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedJobId(null); setSelectedCheckIdx(0); }}
              className="text-[12px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <ArrowLeft size={12} /> All Documents
            </button>
            <span className="text-gray-300">·</span>
            <span className="text-[13px] font-medium text-gray-900">{selectedJob.pdf_name}</span>
            <span className="text-[11px] text-gray-400">{selectedJob.total_checks} checks</span>
          </div>

          <div className="grid grid-cols-12 gap-5">
            {/* ── Table (left) ──────────────────────── */}
            <div className="col-span-7">
              <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Reconciliation</h2>
                  <span className="text-[11px] text-gray-400">{reconciliationRows.length} items</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-50 bg-gray-50/30">
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Check #</th>
                        <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Payee</th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Confidence</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {reconciliationRows.map((row) => (
                        <tr
                          key={row.check.check_id}
                          className={`hover:bg-blue-50/30 cursor-pointer transition ${selectedCheckIdx === row.idx ? 'bg-blue-50/50' : ''}`}
                          onClick={() => setSelectedCheckIdx(row.idx)}
                        >
                          <td className="px-3 py-2.5 font-mono text-gray-700">{row.checkNumber}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-900 truncate max-w-[140px]">{row.payee}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-900">{row.amount}</td>
                          <td className="px-3 py-2.5 text-center text-gray-600">{row.date}</td>
                          <td className="px-3 py-2.5 text-center">{statusBadge(row.status, row.actionState)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center w-10 h-5 rounded text-[11px] font-bold border ${confBg(row.confidence / 100)}`}>
                              {row.confidence}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(row.check.check_id, 'confirmed'); }}
                                className={`p-1 rounded transition ${row.actionState === 'confirmed' ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                title="Confirm Match"
                              >
                                <ThumbsUp size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAction(row.check.check_id, 'duplicate'); }}
                                className={`p-1 rounded transition ${row.actionState === 'duplicate' ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                title="Mark Duplicate"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── Detail Panel (right) ──────────────── */}
            <div className="col-span-5 space-y-4">
              {selectedCheck && selectedCheck.extraction ? (
                <>
                  {/* Check Image */}
                  <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-gray-700">
                        Check {selectedCheckIdx + 1} of {selectedJob.checks.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedCheckIdx(Math.max(0, selectedCheckIdx - 1))}
                          disabled={selectedCheckIdx === 0}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          onClick={() => setSelectedCheckIdx(Math.min(selectedJob.checks.length - 1, selectedCheckIdx + 1))}
                          disabled={selectedCheckIdx === selectedJob.checks.length - 1}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-50 flex items-center justify-center p-3">
                      <img
                        src={`/api/check-image/${selectedJob.job_id}/${selectedCheck.check_id}`}
                        alt="Check image"
                        className="max-h-[160px] object-contain rounded"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  </div>

                  {/* Side-by-side OCR vs QBO Data */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* OCR Data */}
                    <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-100 bg-blue-50/50">
                        <h3 className="text-[12px] font-semibold text-blue-800">OCR Data</h3>
                      </div>
                      <div className="p-3 space-y-2">
                        {[
                          { label: 'Check #', field: 'checkNumber' },
                          { label: 'Payee', field: 'payee' },
                          { label: 'Date', field: 'checkDate' },
                          { label: 'Amount', field: 'amount' },
                          { label: 'Bank', field: 'bankName' },
                          { label: 'Memo', field: 'memo' },
                        ].map(({ label, field }) => (
                          <div key={field}>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
                            <div className="flex items-center justify-between">
                              <p className="text-[12px] font-medium text-gray-900">{extVal(selectedCheck.extraction, field) || '—'}</p>
                              {extConf(selectedCheck.extraction, field) > 0 && (
                                <span className={`text-[10px] font-bold ${confColor(extConf(selectedCheck.extraction, field))}`}>
                                  {Math.round(extConf(selectedCheck.extraction, field) * 100)}%
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* QBO Data (placeholder until connected) */}
                    <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-100 bg-emerald-50/50">
                        <h3 className="text-[12px] font-semibold text-emerald-800">QBO Data</h3>
                      </div>
                      <div className="p-3 space-y-2">
                        {[
                          { label: 'TxnNumber', value: extVal(selectedCheck.extraction, 'checkNumber') || '—' },
                          { label: 'TxnDesc', value: extVal(selectedCheck.extraction, 'payee') || '—' },
                          { label: 'TxnDate', value: extVal(selectedCheck.extraction, 'checkDate') || '—' },
                          { label: 'Amount', value: extVal(selectedCheck.extraction, 'amount') || '—' },
                          { label: 'Account', value: 'Checking' },
                          { label: 'Memo', value: extVal(selectedCheck.extraction, 'memo') || '—' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
                            <p className="text-[12px] font-medium text-gray-900">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(selectedCheck.check_id, 'confirmed')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-[13px] font-medium transition shadow-sm"
                    >
                      <CheckCircle size={14} /> Confirm Match
                    </button>
                    <button
                      onClick={() => handleAction(selectedCheck.check_id, 'duplicate')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-[13px] font-medium transition shadow-sm"
                    >
                      <Copy size={14} /> Mark Duplicate
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAction(selectedCheck.check_id, 'flagged')}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-orange-300 text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 text-[12px] font-medium transition"
                    >
                      <Flag size={13} /> Flag for Review
                    </button>
                    <button
                      onClick={() => handleAction(selectedCheck.check_id, null)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-[12px] font-medium transition"
                    >
                      <RotateCcw size={13} /> Reset
                    </button>
                  </div>

                  {/* Audit Trail for this check */}
                  <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <h3 className="text-[12px] font-semibold text-gray-700">Audit Log</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <div className="px-4 py-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[11px] text-gray-500">
                          {new Date(selectedJob.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-[11px] font-medium text-gray-700">OCR Extracted Data</span>
                      </div>
                      {selectedCheck.methods_used?.map(method => (
                        <div key={method} className="px-4 py-2 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-[11px] text-gray-500">Engine</span>
                          <span className="text-[11px] font-medium text-gray-700 capitalize">{method}</span>
                        </div>
                      ))}
                      {actionStates[`${selectedJob.job_id}-${selectedCheck.check_id}`] && (
                        <div className="px-4 py-2 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          <span className="text-[11px] text-gray-500">Now</span>
                          <span className="text-[11px] font-medium text-gray-700 capitalize">
                            {actionStates[`${selectedJob.job_id}-${selectedCheck.check_id}`]}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200/80 p-8 text-center">
                  <Eye size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-[13px] text-gray-500">Select a check from the table to view details</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
