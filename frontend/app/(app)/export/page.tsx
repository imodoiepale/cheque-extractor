'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Download, FileText, CheckCircle, FileSpreadsheet, Loader2,
} from 'lucide-react';
import {
  Badge, Button, GlassCard, GlassCardTitle, GlassPanel, Skeleton,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Export.
 *
 * Two lists, and neither row is glass: the containers are GlassCards and the
 * rows are plain hairline divs, so the blurred-element count is 2 whether
 * there is one document or four hundred.
 *
 * Row heights are declared once each and are unchanged from pre-redesign
 * (`px-5 py-3` for documents, `px-5 py-2.5` for the export log).
 */
const DOC_ROW = 'px-5 py-3';
const LOG_ROW = 'px-5 py-2.5';

interface Job {
  job_id: string;
  pdf_name: string;
  status: string;
  total_checks: number;
  checks?: any[];
  created_at: string;
  completed_at?: string;
}

interface ExportFormat {
  id: string;
  name: string;
  ext: string;
  description: string;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

export default function ExportPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<{ jobId: string; format: string; time: string; checks: number }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, fmtRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch(`${BACKEND}/api/export-formats`),
      ]);
      const jobsData = await jobsRes.json();
      const fmtData = await fmtRes.json();

      const completed = (jobsData.jobs || [])
        .filter((j: Job) => j.status === 'complete' && (j.checks?.length || j.total_checks > 0))
        .sort((a: Job, b: Job) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setJobs(completed);
      setFormats(fmtData.formats || []);
      setLoadError(null);
    } catch (e: any) {
      console.error('Failed to fetch export data:', e);
      setLoadError(e?.message || 'Could not reach the extraction service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleJob = (id: string) => {
    setSelectedJobs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.job_id)));
    }
  };

  const handleExport = async (jobId: string, format: string) => {
    setExporting(jobId);
    try {
      window.open(`/api/jobs/${jobId}/export?format=${format}`, '_blank');
      const job = jobs.find(j => j.job_id === jobId);
      setExportHistory(prev => [{
        jobId,
        format,
        time: new Date().toISOString(),
        checks: job?.total_checks || 0,
      }, ...prev].slice(0, 20));
    } finally {
      setTimeout(() => setExporting(null), 1000);
    }
  };

  const handleBulkExport = () => {
    selectedJobs.forEach(id => handleExport(id, selectedFormat));
  };

  const extractedCount = (job: Job) =>
    (job.checks || []).filter((c: any) => c.extraction && Object.keys(c.extraction).length > 0).length;

  const fmtDate = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const totalChecksSelected = jobs
    .filter(j => selectedJobs.has(j.job_id))
    .reduce((sum, j) => sum + extractedCount(j), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5" data-tone="calm">
      {/* ── Header ──────────────────────────────────── */}
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong">Export</h1>
        <p className="mt-0.5 text-sm text-ink-faint">
          Download extracted cheque data in accounting formats
        </p>
      </div>

      {loadError && (
        <p role="alert" className="rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text">
          {loadError}
        </p>
      )}

      {/* ── Format picker ───────────────────────────── */}
      <GlassCard padding="md">
        <GlassCardTitle className="text-base">Export format</GlassCardTitle>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {loading && formats.length === 0
            ? [0, 1, 2].map(i => <Skeleton key={i} shape="block" className="h-[62px] w-full" />)
            : formats.map(fmt => {
                const active = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={cn(
                      'press rounded-tile border px-3.5 py-2.5 text-left text-sm',
                      active
                        ? 'border-brand bg-brand/[0.08] shadow-glass-selected'
                        : 'border-glass-hairline bg-surface/60 hover:bg-brand/[0.045]'
                    )}
                  >
                    <div className="font-semibold text-ink-strong">{fmt.name}</div>
                    <div className="nums mt-0.5 text-[11px] text-ink-faint">
                      {fmt.ext} · {fmt.description.split('.')[0]}
                    </div>
                  </button>
                );
              })}
        </div>
      </GlassCard>

      {/* ── Documents ready to export ───────────────── */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-hairline px-5 py-3.5">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedJobs.size === jobs.length && jobs.length > 0}
              onChange={toggleAll}
              aria-label="Select all documents"
              className="h-4 w-4 rounded border-glass-hairline accent-primary"
            />
            <GlassCardTitle className="text-base">
              Documents <span className="nums text-ink-faint">({jobs.length})</span>
            </GlassCardTitle>
          </div>
          {selectedJobs.size > 0 && (
            <Button size="sm" icon={<Download size={13} />} onClick={handleBulkExport}>
              <span className="nums">
                Export {selectedJobs.size} · {totalChecksSelected} cheques
              </span>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map(i => <Skeleton key={i} shape="text" className="w-full" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileSpreadsheet className="mx-auto mb-3 h-9 w-9 text-ink-faint" aria-hidden />
            <p className="font-heading text-base font-semibold text-ink-strong">No completed documents</p>
            <p className="mt-1 text-sm text-ink-body">Upload and extract cheques to export them.</p>
          </div>
        ) : (
          <ul className="divide-y divide-glass-hairline">
            {jobs.map(job => {
              const ext = extractedCount(job);
              const selected = selectedJobs.has(job.job_id);
              return (
                <li
                  key={job.job_id}
                  className={cn(
                    'flex items-center gap-3 transition-colors duration-quick ease-settle',
                    DOC_ROW,
                    selected ? 'bg-brand/[0.08]' : 'hover:bg-brand/[0.045]'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleJob(job.job_id)}
                    aria-label={`Select ${job.pdf_name}`}
                    className="h-4 w-4 rounded border-glass-hairline accent-primary"
                  />
                  <FileText size={15} className="shrink-0 text-ink-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-strong">{job.pdf_name}</div>
                    <div className="nums mt-0.5 text-[11px] text-ink-faint">
                      {ext}/{job.total_checks} cheques extracted · {fmtDate(job.completed_at || job.created_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport(job.job_id, selectedFormat)}
                    disabled={exporting === job.job_id}
                    className="press inline-flex min-h-0 items-center gap-1 whitespace-nowrap rounded-full border border-glass-hairline bg-surface/70 px-3 py-1.5 text-xs font-semibold text-brand-deep hover:bg-brand/[0.08] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-disabled"
                  >
                    {exporting === job.job_id
                      ? <Loader2 size={12} className="animate-spin" aria-hidden />
                      : <Download size={12} aria-hidden />}
                    {formats.find(f => f.id === selectedFormat)?.ext || '.csv'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      {/* ── Export log. Session-only; it is labelled as such. ───────── */}
      {exportHistory.length > 0 && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-glass-hairline px-5 py-3.5">
            <GlassCardTitle className="text-base">Recent exports</GlassCardTitle>
            <Badge tone="outline" size="sm">This session only</Badge>
          </div>
          <ul className="divide-y divide-glass-hairline">
            {exportHistory.map((h, i) => (
              <li key={i} className={cn('flex items-center gap-3', LOG_ROW)}>
                <CheckCircle size={14} className="shrink-0 text-success" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-body">
                  {jobs.find(j => j.job_id === h.jobId)?.pdf_name || h.jobId}
                </span>
                <span className="nums shrink-0 text-[11px] text-ink-faint">
                  {h.checks} cheques · {h.format.toUpperCase()} · {new Date(h.time).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {/* The export log is in-memory. Saying so is cheaper than a reader
          trusting it as an audit trail; the real log lands with section 13. */}
      <GlassPanel tone="plain" radius="tile" padding="sm">
        <p className="text-xs text-ink-faint">
          Exports are generated on demand and are not retained. The list above resets when
          you reload the page — a persistent export history lands with reports and retention.
        </p>
      </GlassPanel>
    </div>
  );
}
