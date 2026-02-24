'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  CheckCircle, AlertTriangle, Copy, Eye, Search,
  Loader2, RefreshCw, TrendingUp, ArrowRight,
  Clock, Flag, ShieldCheck, ChevronRight, Filter,
  FileText, Users, BarChart3, Activity, Upload,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';

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
  completed_at?: string;
}

interface AuditEntry {
  id: string;
  time: string;
  type: 'auto_match' | 'manual_override' | 'ocr_extracted' | 'flagged' | 'duplicate';
  description: string;
  details?: string;
  checkNumber?: string;
  payee?: string;
  amount?: string;
}

interface ReviewItem {
  check_id: string;
  job_id: string;
  checkNumber: string;
  payee: string;
  amount: string;
  status: 'review' | 'mismatch' | 'manual' | 'flagged';
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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return iso; }
}

// ── Component ──────────────────────────────────────────────
export default function FirmDashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; error?: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ count: number; total?: number; error?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleQBOFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/qbo/upload-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadResult({ count: data.imported, total: data.totalTransactions });
      fetchJobs();
    } catch (err: any) {
      setUploadResult({ count: 0, error: err.message });
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleQBSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/qbo/pull-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult({ count: data.count });
    } catch (e: any) {
      setSyncResult({ count: 0, error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setJobs((data.jobs || []).sort((a: Job, b: Job) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (e) {
      console.error('Failed to fetch:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Derived Stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'complete');
    const allChecks = completedJobs.flatMap(j => j.checks || []);
    const totalChecks = allChecks.length;
    const extractedChecks = allChecks.filter(c => c.extraction && Object.keys(c.extraction).length > 0);

    // Confidence-based matching simulation
    let matched = 0;
    let duplicates = 0;
    let missing = 0;
    let manualReview = 0;
    const seenAmounts = new Map<string, number>();

    extractedChecks.forEach(c => {
      const amt = extVal(c.extraction, 'amount');
      const payee = extVal(c.extraction, 'payee');
      const avgConf = ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((sum, f) => sum + extConf(c.extraction, f), 0) / 4;

      // Duplicate detection
      const key = `${amt}-${payee}`;
      seenAmounts.set(key, (seenAmounts.get(key) || 0) + 1);

      if (avgConf > 0.8) matched++;
      else if (avgConf > 0.5) manualReview++;
      else missing++;
    });

    seenAmounts.forEach((count) => { if (count > 1) duplicates += count - 1; });

    const matchRate = totalChecks > 0 ? Math.round((matched / totalChecks) * 100) : 0;

    return { totalChecks, matched, duplicates, missing, manualReview, matchRate, extractedChecks, completedJobs };
  }, [jobs]);

  // ── Match Rate Over Time (simulated from job dates) ────
  const matchRateHistory = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'complete').sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let runningTotal = 0;
    let runningMatched = 0;

    return completedJobs.map(j => {
      const checks = j.checks || [];
      const extracted = checks.filter(c => c.extraction && Object.keys(c.extraction).length > 0);
      const highConf = extracted.filter(c => {
        const avg = ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(c.extraction, f), 0) / 4;
        return avg > 0.8;
      });

      runningTotal += checks.length;
      runningMatched += highConf.length;
      const rate = runningTotal > 0 ? Math.round((runningMatched / runningTotal) * 100) : 0;

      return {
        date: new Date(j.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        rate,
        checks: checks.length,
      };
    });
  }, [jobs]);

  // ── Client Overview (group by PDF source) ──────────────
  const clientOverview = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'complete');
    return completedJobs.slice(0, 10).map(j => {
      const checks = j.checks || [];
      const extracted = checks.filter(c => c.extraction && Object.keys(c.extraction).length > 0);
      const highConf = extracted.filter(c => {
        const avg = ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(c.extraction, f), 0) / 4;
        return avg > 0.8;
      });
      const matchRate = checks.length > 0 ? Math.round((highConf.length / checks.length) * 100) : 0;

      const seenAmounts = new Map<string, number>();
      extracted.forEach(c => {
        const key = `${extVal(c.extraction, 'amount')}-${extVal(c.extraction, 'payee')}`;
        seenAmounts.set(key, (seenAmounts.get(key) || 0) + 1);
      });
      let alerts = 0;
      seenAmounts.forEach(count => { if (count > 1) alerts++; });

      return {
        name: j.pdf_name.replace(/\.pdf$/i, ''),
        checksThisMonth: checks.length,
        matchRate,
        alerts,
        status: matchRate > 80 ? 'good' : matchRate > 50 ? 'warning' : 'critical',
        jobId: j.job_id,
      };
    });
  }, [jobs]);

  // ── Review Queue ───────────────────────────────────────
  const reviewQueue = useMemo((): ReviewItem[] => {
    const items: ReviewItem[] = [];
    jobs.filter(j => j.status === 'complete').forEach(j => {
      (j.checks || []).forEach(c => {
        if (!c.extraction) return;
        const avgConf = ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(c.extraction, f), 0) / 4;
        if (avgConf <= 0.8) {
          items.push({
            check_id: c.check_id,
            job_id: j.job_id,
            checkNumber: extVal(c.extraction, 'checkNumber') || '—',
            payee: extVal(c.extraction, 'payee') || 'Unknown',
            amount: extVal(c.extraction, 'amount') || '—',
            status: avgConf > 0.5 ? 'review' : avgConf > 0.3 ? 'mismatch' : 'manual',
          });
        }
      });
    });
    return items.slice(0, 20);
  }, [jobs]);

  // ── Audit Log ──────────────────────────────────────────
  const auditLog = useMemo((): AuditEntry[] => {
    const entries: AuditEntry[] = [];
    jobs.filter(j => j.status === 'complete').forEach(j => {
      (j.checks || []).forEach(c => {
        if (!c.extraction) return;
        const avgConf = ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(c.extraction, f), 0) / 4;
        const checkNum = extVal(c.extraction, 'checkNumber');
        const payee = extVal(c.extraction, 'payee');
        const amount = extVal(c.extraction, 'amount');

        entries.push({
          id: `${j.job_id}-${c.check_id}-ocr`,
          time: j.created_at,
          type: 'ocr_extracted',
          description: 'OCR Extracted Data',
          details: `Check #${checkNum} · Payee: ${payee} · $${amount}`,
          checkNumber: checkNum,
          payee,
          amount,
        });

        if (avgConf > 0.8) {
          entries.push({
            id: `${j.job_id}-${c.check_id}-match`,
            time: j.completed_at || j.created_at,
            type: 'auto_match',
            description: 'Auto Match Found',
            details: `Check #${checkNum} · $${amount}`,
            checkNumber: checkNum,
            payee,
            amount,
          });
        }
      });
    });

    return entries
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 15);
  }, [jobs]);

  // ── Status badge colors ────────────────────────────────
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    review: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Review' },
    mismatch: { bg: 'bg-red-100', text: 'text-red-700', label: 'Mismatch' },
    manual: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Manual' },
    flagged: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Flagged' },
  };

  const auditTypeConfig: Record<string, { icon: any; color: string; bg: string }> = {
    auto_match: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    manual_override: { icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
    ocr_extracted: { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50' },
    flagged: { icon: Flag, color: 'text-orange-600', bg: 'bg-orange-50' },
    duplicate: { icon: Copy, color: 'text-red-600', bg: 'bg-red-50' },
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Firm Dashboard</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Cheque reconciliation overview</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 w-48"
            />
          </div>
          <label
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-[13px] font-medium transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <input
              type="file"
              accept=".qbo,.ofx,.qfx"
              onChange={handleQBOFileUpload}
              className="hidden"
              disabled={uploadingFile}
            />
            {uploadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploadingFile ? 'Uploading...' : 'Upload .QBO'}
          </label>
          <button
            onClick={handleQBSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-[13px] font-medium transition shadow-sm disabled:opacity-50"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing...' : 'Sync from QuickBooks'}
          </button>
          {(syncResult || uploadResult) && (
            <span className={`text-[11px] px-2 py-1 rounded ${
              (syncResult?.error || uploadResult?.error) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {syncResult?.error || uploadResult?.error || (
                syncResult ? `${syncResult.count} entries synced` :
                uploadResult ? `${uploadResult.count} cheques imported${uploadResult.total ? ` (${uploadResult.total} total)` : ''}` : ''
              )}
            </span>
          )}
          <button
            onClick={fetchJobs}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw size={16} />
          </button>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as any)}
            className="px-3 py-2 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="overview">Overview</option>
            <option value="detail">Detail</option>
          </select>
        </div>
      </div>

      {/* ── Top Stats Cards ─────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white shadow-lg shadow-blue-200">
          <p className="text-blue-100 text-[11px] font-medium uppercase tracking-wider">Checks</p>
          <p className="text-3xl font-bold mt-1">{stats.totalChecks.toLocaleString()}</p>
          <p className="text-blue-200 text-[11px] mt-1">Total processed</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg shadow-emerald-200">
          <p className="text-emerald-100 text-[11px] font-medium uppercase tracking-wider">Match Rate</p>
          <p className="text-3xl font-bold mt-1">{stats.matchRate}%</p>
          <p className="text-emerald-200 text-[11px] mt-1">Auto-matched</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white shadow-lg shadow-red-200">
          <p className="text-red-100 text-[11px] font-medium uppercase tracking-wider">Duplicate Alerts</p>
          <p className="text-3xl font-bold mt-1">{stats.duplicates}</p>
          <p className="text-red-200 text-[11px] mt-1">Potential duplicates</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white shadow-lg shadow-amber-200">
          <p className="text-amber-100 text-[11px] font-medium uppercase tracking-wider">Manual Reviews</p>
          <p className="text-3xl font-bold mt-1">{stats.manualReview}</p>
          <p className="text-amber-200 text-[11px] mt-1">Needs attention</p>
        </div>
      </div>

      {/* ── Main Grid ───────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">
        {/* ── Left Column (8 cols) ──────────────────── */}
        <div className="col-span-8 space-y-5">
          {/* Client Overview Table */}
          <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Client Overview</h2>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">{clientOverview.length} documents</span>
              </div>
            </div>

            {/* Mini stats bar */}
            <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-[12px] font-bold">
                {stats.totalChecks} <span className="font-normal text-blue-600">Checks This Month</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-[12px] font-bold">
                {stats.matchRate}% <span className="font-normal text-emerald-600">Auto-Match Rate</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-[12px] font-bold">
                {stats.duplicates} <span className="font-normal text-red-600">Duplicates</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-[12px] font-bold">
                {stats.missing} <span className="font-normal text-gray-600">Missing</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/30">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Client Name</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Checks</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Match Rate</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Alerts</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientOverview.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-[13px]">
                        No completed documents yet. Upload and process cheques to see data here.
                      </td>
                    </tr>
                  ) : (
                    clientOverview.map((client) => (
                      <tr key={client.jobId} className="hover:bg-gray-50/50 transition">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900 truncate block max-w-[200px]">{client.name}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-gray-900">{client.checksThisMonth}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[12px] font-bold text-gray-900">{client.matchRate}%</span>
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${client.matchRate > 80 ? 'bg-emerald-500' : client.matchRate > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${client.matchRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {client.alerts > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[11px] font-medium">
                              <AlertTriangle size={10} /> {client.alerts}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            client.status === 'good' ? 'bg-emerald-50 text-emerald-700' :
                            client.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {client.status === 'good' ? 'Matched' : client.status === 'warning' ? 'Partial' : 'Review'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href={`/reconciliation?job=${client.jobId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[11px] font-medium transition"
                          >
                            <Eye size={12} /> Inspect
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Match Rate Over Time Chart */}
          <div className="bg-white rounded-xl border border-gray-200/80 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Match Rate Over Time</h2>
              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <TrendingUp size={12} className="text-emerald-500" />
                <span>Trending {stats.matchRate > 70 ? 'up' : 'stable'}</span>
              </div>
            </div>
            {matchRateHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={matchRateHistory}>
                  <defs>
                    <linearGradient id="matchGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value: number) => [`${value}%`, 'Match Rate']}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#matchGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-[13px]">
                <BarChart3 size={20} className="mr-2" /> Process documents to see match rate trends
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column (4 cols) ─────────────────── */}
        <div className="col-span-4 space-y-5">
          {/* Review Queue */}
          <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Review Queue</h2>
              <div className="flex items-center gap-2">
                <button className="p-1 hover:bg-gray-100 rounded transition">
                  <Filter size={13} className="text-gray-400" />
                </button>
                <span className="text-[11px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                  {reviewQueue.length}
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
              {reviewQueue.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
                  <CheckCircle size={20} className="mx-auto mb-2 text-emerald-400" />
                  All checks are matched!
                </div>
              ) : (
                reviewQueue.map((item) => {
                  const sc = statusConfig[item.status];
                  return (
                    <div key={`${item.job_id}-${item.check_id}`} className="px-4 py-2.5 hover:bg-gray-50/50 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[12px] font-mono text-gray-500 flex-shrink-0">#{item.checkNumber}</span>
                          <span className="text-[12px] font-medium text-gray-900 truncate">{item.payee}</span>
                        </div>
                        <span className="text-[12px] font-medium text-gray-700 flex-shrink-0 ml-2">{item.amount}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/reconciliation?job=${item.job_id}&check=${item.check_id}`}
                            className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                          >
                            Review
                          </Link>
                          <span className="text-gray-300">·</span>
                          <button className="text-[10px] text-red-500 hover:text-red-700 font-medium">
                            Override
                          </button>
                          <span className="text-gray-300">·</span>
                          <button className="text-[10px] text-orange-500 hover:text-orange-700 font-medium">
                            Flag
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Audit Log */}
          <div className="bg-white rounded-xl border border-gray-200/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Audit Log</h2>
              <Link
                href="/analytics"
                className="text-[11px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-0.5"
              >
                Trend Analysis <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {auditLog.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-[13px]">
                  <Activity size={20} className="mx-auto mb-2" />
                  No audit entries yet
                </div>
              ) : (
                auditLog.map((entry) => {
                  const config = auditTypeConfig[entry.type];
                  const Icon = config.icon;
                  return (
                    <div key={entry.id} className="px-4 py-2.5 hover:bg-gray-50/50 transition">
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1 rounded ${config.bg} flex-shrink-0 mt-0.5`}>
                          <Icon size={12} className={config.color} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-medium text-gray-900">{entry.description}</span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{fmtTime(entry.time)}</span>
                          </div>
                          {entry.details && (
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{entry.details}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
