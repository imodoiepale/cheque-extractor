'use client';

import { FileText, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { GlassCard, STATUS_TONES, type StatusKey } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Job {
  job_id: string;
  status: string;
  pdf_name: string;
  total_pages: number;
  total_checks: number;
  created_at: string;
}

interface Props {
  jobs: Job[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  statusFilters: Set<string>;
  onToggleStatusFilter: (status: string) => void;
}

/**
 * The app's job statuses mapped onto the StatusPill vocabulary, so the same
 * word is never two colours in two places. `StatusPill` maps the 13 keys; this
 * only translates the backend's names into them.
 */
const STATUS_KEY: Record<string, StatusKey> = {
  complete: 'complete',
  analyzed: 'approved',
  pending: 'pending',
  extracting: 'processing',
  ocr_running: 'processing',
  error: 'error',
};

/** Icon per status. Colour comes from the same tone the pill would use. */
function StatusIcon({ status }: { status: string }) {
  const tone = STATUS_TONES[STATUS_KEY[status] ?? 'pending'];
  const colour = {
    success: 'text-success-text',
    brand: 'text-info-text',
    warning: 'text-warning-text',
    error: 'text-error-text',
    neutral: 'text-neutral-text',
  }[tone];

  if (status === 'complete' || status === 'analyzed') return <CheckCircle size={12} className={colour} />;
  if (status === 'extracting' || status === 'ocr_running') return <Loader2 size={12} className={cn(colour, 'animate-spin')} />;
  if (status === 'error') return <AlertCircle size={12} className={colour} />;
  return <Clock size={12} className={colour} />;
}

export default function DocumentSidebar({
  jobs,
  selectedJobId,
  onSelectJob,
  statusFilters,
  onToggleStatusFilter,
}: Props) {
  const statusCounts = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredJobs = jobs.filter((job) =>
    statusFilters.size === 0 || statusFilters.has(job.status)
  );

  return (
    // ONE blurred surface for the whole sidebar. The rows inside are plain —
    // backdrop-filter per row is a compositing layer per row.
    <GlassCard padding="none" className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-glass-hairline px-3 py-2">
        <h3 className="text-eyebrow text-ink-faint">Documents ({jobs.length})</h3>
      </div>

      {/* All Documents Option */}
      <div className="border-b border-glass-hairline px-2 py-1">
        <button
          onClick={() => onSelectJob(null)}
          className={cn(
            'press w-full rounded-input px-2 py-1.5 text-left text-xs font-medium',
            selectedJobId === null
              ? 'bg-brand/[0.1] text-brand-deep'
              : 'text-ink-body hover:bg-ink-strong/[0.04] hover:text-ink-strong'
          )}
        >
          All Documents
        </button>
      </div>

      {/* Document List */}
      <div className="scroll-region min-h-0 flex-1 px-2 py-1">
        {filteredJobs.length === 0 ? (
          <div className="py-4 text-center text-xs text-ink-faint">
            No documents
          </div>
        ) : (
          filteredJobs.map((job, idx) => (
            <button
              key={job.job_id}
              onClick={() => onSelectJob(job.job_id)}
              className={cn(
                'press flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left',
                selectedJobId === job.job_id
                  ? 'bg-brand/[0.1]'
                  : 'hover:bg-ink-strong/[0.04]'
              )}
            >
              <span className="nums w-4 text-[10px] font-semibold text-ink-faint">{idx + 1}</span>
              <FileText size={12} className="shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-ink-strong">
                  {job.pdf_name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-faint">
                  <span className="nums">{job.total_pages}pg</span>
                  <span className="nums">{job.total_checks}chk</span>
                  <StatusIcon status={job.status} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Status Filters */}
      <div className="border-t border-glass-hairline px-2 py-2">
        <div className="text-eyebrow mb-1 text-ink-faint">Filters</div>
        <div className="space-y-0.5">
          {[
            { status: 'complete', label: 'Complete' },
            { status: 'pending', label: 'Pending' },
            { status: 'extracting', label: 'Extracting' },
            { status: 'ocr_running', label: 'Processing' },
            { status: 'error', label: 'Error' },
          ].map(({ status, label }) => {
            const count = statusCounts[status] || 0;
            if (count === 0) return null;

            return (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-1.5 rounded-input px-1.5 py-1 transition-colors duration-quick ease-settle hover:bg-ink-strong/[0.04]"
              >
                <input
                  type="checkbox"
                  checked={statusFilters.has(status)}
                  onChange={() => onToggleStatusFilter(status)}
                  className="h-3 w-3 rounded border-glass-hairline"
                />
                <span className="flex-1 text-xs text-ink-body">{label}</span>
                <span className="nums text-[10px] font-medium text-ink-faint">{count}</span>
              </label>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}
