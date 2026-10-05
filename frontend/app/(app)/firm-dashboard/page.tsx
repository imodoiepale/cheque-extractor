'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle, AlertTriangle, Copy, Eye, Search,
  Loader2, RefreshCw, TrendingUp,
  Flag, ShieldCheck, Filter,
  FileText, BarChart3, Activity, Upload, Layers, Zap,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Badge,
  Button,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  IconButton,
  Input,
  KpiTile,
  Table,
  TableScroll,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import {
  areaFade,
  AXIS_TICK,
  CHART_COLORS,
  ChartEmpty,
  ChartFrame,
  GRID_PROPS,
  NO_TWEEN,
  TOOLTIP_PROPS,
} from '@/lib/charts';

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

/** The Client Overview table keeps its pre-redesign `px-4 py-3` row, which is
 *  the shared `tdVariants` recipe, so it adopts the primitive unchanged. The
 *  only local metric is the extraction micro-bar width below. */
const METER = 'h-1.5 overflow-hidden rounded-full';

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

const isExtracted = (c: JobCheck) => !!c.extraction && Object.keys(c.extraction).length > 0;

const avgConfidence = (ext: any) =>
  ['amount', 'payee', 'checkDate', 'checkNumber'].reduce((s, f) => s + extConf(ext, f), 0) / 4;

/** A rate meter's fill is state, so it reads off the state tokens. */
const rateFill = (rate: number) =>
  rate > 80 ? 'bg-success' : rate > 50 ? 'bg-warning' : 'bg-error';

export default function FirmDashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; error?: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ count: number; total?: number; error?: string } | null>(null);

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
      const rawText = await res.text();
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        throw new Error(res.status === 504 || rawText.startsWith('An error')
          ? 'Request timed out — try again or add a date range filter.'
          : `Server error (${res.status}): ${rawText.substring(0, 120)}`);
      }
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult({ count: data.count });
    } catch (e: any) {
      setSyncResult({ count: 0, error: e.message });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Derived Stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'complete');
    const allChecks = completedJobs.flatMap(j => j.checks || []);
    const totalChecks = allChecks.length;
    const extractedChecks = allChecks.filter(isExtracted);

    // Confidence-based matching simulation
    let matched = 0;
    let duplicates = 0;
    let missing = 0;
    let manualReview = 0;
    const seenAmounts = new Map<string, number>();

    extractedChecks.forEach(c => {
      const amt = extVal(c.extraction, 'amount');
      const payee = extVal(c.extraction, 'payee');
      const avgConf = avgConfidence(c.extraction);

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

  /**
   * ── Processing metrics ───────────────────────────────────
   * Moved here verbatim from the removed /analytics route (CHECKLIST 3, item
   * 10: "Remove the Analytics page; its content moves into Firm Admin"). The
   * figures are the same ones that page computed — document counts, pages
   * scanned, extraction success rate, the per-engine breakdown and the job
   * status split — only now they sit beside the reconciliation numbers they
   * were always read against. Note the data source changed from the backend
   * origin to the `/api/jobs` proxy, which is how every other page reads it.
   */
  const processing = useMemo(() => {
    const totalDocs = jobs.length;
    const completedDocs = jobs.filter(j => j.status === 'complete').length;
    const errorDocs = jobs.filter(j => j.status === 'error').length;
    const pendingDocs = jobs.filter(j => j.status === 'pending').length;
    const inFlightDocs = jobs.filter(j =>
      ['extracting', 'ocr_running', 'detecting', 'analyzed'].includes(j.status)
    ).length;
    const declaredChecks = jobs.reduce((s, j) => s + (j.total_checks || 0), 0);
    const totalPages = jobs.reduce((s, j) => s + (j.total_pages || 0), 0);

    const allChecks = jobs.flatMap(j => j.checks || []);
    const extracted = allChecks.filter(isExtracted);
    const extractionRate = declaredChecks > 0
      ? Math.round((extracted.length / declaredChecks) * 100)
      : 0;

    const methodCounts: Record<string, number> = {};
    extracted.forEach(c => {
      (c.methods_used || []).forEach((m: string) => {
        methodCounts[m] = (methodCounts[m] || 0) + 1;
      });
    });
    const methodEntries = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);

    const statusSplit = [
      { label: 'Complete', count: completedDocs, tone: 'success' as const },
      { label: 'Processing', count: inFlightDocs, tone: 'brand' as const },
      { label: 'Error', count: errorDocs, tone: 'error' as const },
      { label: 'Pending', count: pendingDocs, tone: 'neutral' as const },
    ].filter(s => s.count > 0);

    return {
      totalDocs, completedDocs, declaredChecks, totalPages,
      extracted, extractionRate, methodEntries, statusSplit,
    };
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
      const extracted = checks.filter(isExtracted);
      const highConf = extracted.filter(c => avgConfidence(c.extraction) > 0.8);

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

  /**
   * ── Client Overview (group by PDF source) ──────────────
   * Carries the per-document extraction figures the Analytics page listed
   * separately. That list and this table were the same rows keyed by the same
   * job, so the two became one table with the extraction columns added rather
   * than a second list of the same documents — the only consolidation in the
   * move, and the slice went from 10 to 15 so no document is lost with it.
   */
  const clientOverview = useMemo(() => {
    const completedJobs = jobs.filter(j => j.status === 'complete');
    return completedJobs.slice(0, 15).map(j => {
      const checks = j.checks || [];
      const extracted = checks.filter(isExtracted);
      const highConf = extracted.filter(c => avgConfidence(c.extraction) > 0.8);
      const matchRate = checks.length > 0 ? Math.round((highConf.length / checks.length) * 100) : 0;
      const extractionRate = j.total_checks > 0
        ? Math.round((extracted.length / j.total_checks) * 100)
        : 0;

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
        extracted: extracted.length,
        declared: j.total_checks,
        extractionRate,
        alerts,
        status: matchRate > 80 ? 'good' : matchRate > 50 ? 'warning' : 'critical',
        jobId: j.job_id,
      };
    });
  }, [jobs]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clientOverview;
    const q = searchQuery.toLowerCase();
    return clientOverview.filter(c => c.name.toLowerCase().includes(q));
  }, [clientOverview, searchQuery]);

  // ── Review Queue ───────────────────────────────────────
  const reviewQueue = useMemo((): ReviewItem[] => {
    const items: ReviewItem[] = [];
    jobs.filter(j => j.status === 'complete').forEach(j => {
      (j.checks || []).forEach(c => {
        if (!c.extraction) return;
        const avgConf = avgConfidence(c.extraction);
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
        const avgConf = avgConfidence(c.extraction);
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

  // ── Status vocabulary, mapped once ─────────────────────
  const reviewTone: Record<string, 'warning' | 'error' | 'brand'> = {
    review: 'warning',
    mismatch: 'error',
    manual: 'brand',
    flagged: 'warning',
  };

  const auditTypeConfig: Record<string, { icon: any; className: string }> = {
    auto_match: { icon: CheckCircle, className: 'bg-success-bg text-success-text' },
    manual_override: { icon: ShieldCheck, className: 'bg-info-bg text-info-text' },
    ocr_extracted: { icon: FileText, className: 'bg-neutral-bg text-neutral-text' },
    flagged: { icon: Flag, className: 'bg-warning-bg text-warning-text' },
    duplicate: { icon: Copy, className: 'bg-error-bg text-error-text' },
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-eyebrow text-ink-faint">Firm Admin</p>
          <h1 className="font-heading text-2xl font-semibold tracking-display text-ink-strong">Firm Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-body">Cheque reconciliation and processing overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="text"
              placeholder="Search documents..."
              aria-label="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 pl-10"
            />
          </div>
          {/* A file input styled as the primary pill. `Button` cannot wrap an
              <input type=file>, so the label carries the same variant classes. */}
          <label className="press inline-flex min-h-tap cursor-pointer items-center justify-center gap-2 rounded-full border border-brand-dark/40 bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-white shadow-brand-glow hover:from-brand-light hover:to-brand">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleQBSync}
            loading={syncing}
            icon={<RefreshCw size={14} />}
          >
            {syncing ? 'Syncing...' : 'Sync from QuickBooks'}
          </Button>
          {(syncResult || uploadResult) && (
            <Badge tone={(syncResult?.error || uploadResult?.error) ? 'error' : 'success'} size="sm">
              {syncResult?.error || uploadResult?.error || (
                syncResult ? `${syncResult.count} entries synced` :
                uploadResult ? `${uploadResult.count} cheques imported${uploadResult.total ? ` (${uploadResult.total} total)` : ''}` : ''
              )}
            </Badge>
          )}
          <IconButton aria-label="Refresh" onClick={fetchJobs}>
            <RefreshCw size={16} />
          </IconButton>
        </div>
      </div>

      {/* ── Reconciliation KPIs ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile tone="brand" label="Checks" value={stats.totalChecks.toLocaleString()} caption="Total processed" />
        <KpiTile tone="success" label="Match Rate" value={`${stats.matchRate}%`} caption="Auto-matched" />
        <KpiTile tone="error" label="Duplicate Alerts" value={stats.duplicates} caption="Potential duplicates" />
        <KpiTile tone="warning" label="Manual Reviews" value={stats.manualReview} caption="Needs attention" />
      </div>

      {/* ── Processing KPIs (from the retired Analytics page) ─── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={<FileText size={16} />}
          label="Documents"
          value={processing.totalDocs}
          caption={`${processing.completedDocs} complete`}
        />
        <KpiTile
          icon={<Layers size={16} />}
          label="Total Cheques"
          value={processing.declaredChecks}
          caption={`${processing.totalPages} pages scanned`}
        />
        <KpiTile
          tone="success"
          icon={<CheckCircle size={16} />}
          label="Extracted"
          value={processing.extracted.length}
          caption={`${processing.extractionRate}% success rate`}
        />
        <KpiTile
          tone="warning"
          icon={<Zap size={16} />}
          label="Methods Used"
          value={processing.methodEntries.length}
          caption={processing.methodEntries.map(([m]) => m).join(', ') || 'None'}
        />
      </div>

      {/* ── Main Grid ───────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">
        {/* ── Left Column ──────────────────────── */}
        <div className="col-span-12 space-y-5 xl:col-span-8">
          {/* Client Overview Table */}
          <GlassCard padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-glass-hairline px-5 py-3.5">
              <GlassCardTitle className="text-sm">Client Overview</GlassCardTitle>
              <span className="nums text-xs text-ink-faint">{filteredClients.length} documents</span>
            </div>

            {/* Mini stats bar — an inset group, never a second blurred pane. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-glass-hairline bg-surface-sunken/50 px-5 py-3">
              <Badge tone="brand" size="md" className="nums font-semibold">
                {stats.totalChecks} <span className="font-normal">Checks This Month</span>
              </Badge>
              <Badge tone="success" size="md" className="nums font-semibold">
                {stats.matchRate}% <span className="font-normal">Auto-Match Rate</span>
              </Badge>
              <Badge tone="error" size="md" className="nums font-semibold">
                {stats.duplicates} <span className="font-normal">Duplicates</span>
              </Badge>
              <Badge tone="neutral" size="md" className="nums font-semibold">
                {stats.missing} <span className="font-normal">Missing</span>
              </Badge>
            </div>

            <TableScroll className="max-h-[32rem]">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Client Name</Th>
                    <Th numeric>Checks</Th>
                    <Th numeric>Match Rate</Th>
                    <Th numeric>Extracted</Th>
                    <Th numeric>Alerts</Th>
                    <Th>Status</Th>
                    <Th>Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredClients.length === 0 ? (
                    <Tr>
                      <Td colSpan={7} className="py-8 text-center text-ink-faint">
                        No completed documents yet. Upload and process cheques to see data here.
                      </Td>
                    </Tr>
                  ) : (
                    filteredClients.map((client) => (
                      <Tr key={client.jobId} interactive>
                        <Td>
                          <span className="block max-w-[200px] truncate font-medium text-ink-strong">{client.name}</span>
                        </Td>
                        <Td numeric className="font-medium">{client.checksThisMonth}</Td>
                        <Td numeric>
                          <div className="flex items-center justify-end gap-2">
                            <span className="nums text-xs font-semibold text-ink-strong">{client.matchRate}%</span>
                            <div className={`glass-track w-16 ${METER}`}>
                              <div
                                className={`h-full rounded-full ${rateFill(client.matchRate)}`}
                                style={{ width: `${client.matchRate}%` }}
                              />
                            </div>
                          </div>
                        </Td>
                        {/* Extraction figures, carried over from Analytics. */}
                        <Td numeric>
                          <div className="flex items-center justify-end gap-2">
                            <span className="nums text-xs text-ink-body">
                              {client.extracted}/{client.declared}
                            </span>
                            <div className={`glass-track w-12 ${METER}`}>
                              <div
                                className={`h-full rounded-full ${rateFill(client.extractionRate)}`}
                                style={{ width: `${client.extractionRate}%` }}
                              />
                            </div>
                          </div>
                        </Td>
                        <Td numeric>
                          {client.alerts > 0 ? (
                            <Badge tone="error" size="sm"><AlertTriangle size={10} /> {client.alerts}</Badge>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                        <Td>
                          <Badge
                            tone={client.status === 'good' ? 'success' : client.status === 'warning' ? 'warning' : 'error'}
                            size="sm"
                          >
                            {client.status === 'good' ? 'Matched' : client.status === 'warning' ? 'Partial' : 'Review'}
                          </Badge>
                        </Td>
                        <Td>
                          <Link
                            href={`/reconciliation?job=${client.jobId}`}
                            className="press inline-flex items-center gap-1 rounded-pill bg-info-bg px-2.5 py-1 text-xs font-medium text-info-text hover:bg-brand/[0.16]"
                          >
                            <Eye size={12} /> Inspect
                          </Link>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </TableScroll>
          </GlassCard>

          {/* Match Rate Over Time Chart */}
          <GlassCard padding="md">
            <div className="mb-4 flex items-center justify-between">
              <GlassCardTitle className="text-sm">Match Rate Over Time</GlassCardTitle>
              <div className="flex items-center gap-1 text-xs text-ink-faint">
                <TrendingUp size={12} className="text-success" />
                <span>Trending {stats.matchRate > 70 ? 'up' : 'stable'}</span>
              </div>
            </div>
            {matchRateHistory.length > 0 ? (
              <ChartFrame height={220}>
                <AreaChart data={matchRateHistory}>
                  {areaFade('firmMatchGrad', CHART_COLORS.brand)}
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_PROPS} formatter={(value: number) => [`${value}%`, 'Match Rate']} />
                  <Area {...NO_TWEEN}
                    type="monotone"
                    dataKey="rate"
                    stroke={CHART_COLORS.brand}
                    strokeWidth={2}
                    fill="url(#firmMatchGrad)"
                  />
                </AreaChart>
              </ChartFrame>
            ) : (
              <ChartEmpty height={220}>
                <BarChart3 size={20} /> Process documents to see match rate trends
              </ChartEmpty>
            )}
          </GlassCard>

          {/* ── Extraction Methods (from the retired Analytics page) ── */}
          {processing.methodEntries.length > 0 && (
            <GlassCard padding="md">
              <GlassCardTitle className="mb-4 text-sm">Extraction Methods</GlassCardTitle>
              <div className="space-y-3">
                {processing.methodEntries.map(([method, count], i) => {
                  const pct = processing.extracted.length > 0
                    ? Math.round((count / processing.extracted.length) * 100)
                    : 0;
                  // Engines are a series, not a state, so they take the brand
                  // ramp in order rather than three unrelated hues.
                  const fill = ['bg-brand', 'bg-brand-light', 'bg-brand-deep'][i % 3];
                  return (
                    <div key={method}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium capitalize text-ink-strong">{method}</span>
                        <span className="nums text-xs text-ink-faint">{count} cheques &middot; {pct}%</span>
                      </div>
                      <div className={`glass-track h-2 overflow-hidden rounded-full`}>
                        <div
                          className={`h-full rounded-full transition-[width] duration-settle ease-settle ${fill}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* ── Job Status (from the retired Analytics page) ── */}
          {processing.statusSplit.length > 0 && (
            <GlassCard padding="md">
              <GlassCardTitle className="mb-4 text-sm">Job Status</GlassCardTitle>
              <div className="flex flex-wrap gap-2">
                {processing.statusSplit.map(s => (
                  <Badge key={s.label} tone={s.tone} size="lg" className="nums font-semibold">
                    {s.count} <span className="font-normal">{s.label}</span>
                  </Badge>
                ))}
              </div>
            </GlassCard>
          )}

          {processing.totalDocs === 0 && (
            <GlassCard padding="lg" className="text-center">
              <BarChart3 className="mx-auto mb-3 text-ink-faint" size={36} />
              <p className="text-sm font-medium text-ink-body">No data yet</p>
              <p className="mt-1 text-xs text-ink-faint">Upload and process documents to see processing metrics</p>
            </GlassCard>
          )}
        </div>

        {/* ── Right Column ─────────────────────── */}
        <div className="col-span-12 space-y-5 xl:col-span-4">
          {/* Review Queue */}
          <GlassCard padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-glass-hairline px-4 py-3">
              <GlassCardTitle className="text-sm">Review Queue</GlassCardTitle>
              <div className="flex items-center gap-2">
                <Filter size={13} className="text-ink-faint" />
                <Badge tone="warning" size="sm" className="nums">{reviewQueue.length}</Badge>
              </div>
            </div>
            <div className="glass-divider scroll-region max-h-[320px]">
              {reviewQueue.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-body">
                  <CheckCircle size={20} className="mx-auto mb-2 text-success" />
                  All checks are matched!
                </div>
              ) : (
                reviewQueue.map((item) => (
                  <div key={`${item.job_id}-${item.check_id}`} className="px-4 py-2.5 transition-colors hover:bg-brand/[0.045]">
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="nums shrink-0 font-mono text-xs text-ink-faint">#{item.checkNumber}</span>
                        <span className="truncate text-xs font-medium text-ink-strong">{item.payee}</span>
                      </div>
                      <span className="nums ml-2 shrink-0 text-xs font-medium text-ink-body">{item.amount}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge tone={reviewTone[item.status]} size="sm" className="capitalize">{item.status}</Badge>
                      <div className="flex items-center gap-1 text-xs font-medium">
                        <Link
                          href={`/reconciliation?job=${item.job_id}&check=${item.check_id}`}
                          className="text-brand-deep hover:underline"
                        >
                          Review
                        </Link>
                        <span className="text-ink-faint">&middot;</span>
                        <Link
                          href={`/reconciliation?job=${item.job_id}&check=${item.check_id}`}
                          className="text-error-text hover:underline"
                        >
                          Override
                        </Link>
                        <span className="text-ink-faint">&middot;</span>
                        <Link
                          href={`/reconciliation?job=${item.job_id}&check=${item.check_id}`}
                          className="text-warning-text hover:underline"
                        >
                          Flag
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          {/* Audit Log */}
          <GlassCard padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-glass-hairline px-4 py-3">
              <GlassCardTitle className="text-sm">Audit Log</GlassCardTitle>
              <span className="nums text-xs text-ink-faint">{auditLog.length} entries</span>
            </div>
            <div className="glass-divider scroll-region max-h-[400px]">
              {auditLog.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-ink-body">
                  <Activity size={20} className="mx-auto mb-2 text-ink-faint" />
                  No audit entries yet
                </div>
              ) : (
                auditLog.map((entry) => {
                  const config = auditTypeConfig[entry.type];
                  const Icon = config.icon;
                  return (
                    <div key={entry.id} className="px-4 py-2.5 transition-colors hover:bg-brand/[0.045]">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 shrink-0 rounded-input p-1 ${config.className}`}>
                          <Icon size={12} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-ink-strong">{entry.description}</span>
                            <span className="nums ml-2 shrink-0 text-xs text-ink-faint">{fmtTime(entry.time)}</span>
                          </div>
                          {entry.details && (
                            <p className="mt-0.5 truncate text-xs text-ink-faint">{entry.details}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </GlassCard>

          {/* Per-engine usage summary, so the right rail still carries the
              processing story when the left column is filtered. */}
          {processing.methodEntries.length > 0 && (
            <GlassPanel tone="neutral" radius="card" padding="md">
              <p className="text-eyebrow mb-2 text-ink-faint">Engines in use</p>
              <div className="flex flex-wrap gap-2">
                {processing.methodEntries.map(([m, c]) => (
                  <Badge key={m} tone="outline" size="sm" className="nums capitalize">{m} · {c}</Badge>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
