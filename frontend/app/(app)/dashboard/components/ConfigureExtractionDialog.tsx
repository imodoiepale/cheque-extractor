'use client';

import { useState, useEffect, useMemo } from 'react';
import { Play, AlertCircle } from 'lucide-react';
import { Button, Dialog, GlassPanel, Input } from '@/components/ui';

interface JobCheck {
  check_id: string;
  page: number;
  extraction?: any;
}

interface Job {
  job_id: string;
  pdf_name: string;
  total_pages: number;
  total_checks: number;
  checks: JobCheck[];
}

interface Props {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: ExtractionConfig) => void;
}

interface ExtractionConfig {
  job_id: string;
  methods: string[];
  page_range?: { from: number; to: number } | null;
  cheque_range?: { from: number; to: number } | null;
  force: boolean;
}

type PageRangeMode = 'all' | 'missing' | 'custom';
type CheckRangeMode = 'all' | 'failed' | 'custom';

// Kyriq picks the engine; the user is never asked. Michael, 21 Sep: no OCR,
// image or confidence settings in the UI.
const EXTRACTION_METHOD = 'gemini';
const SECONDS_PER_CHECK = 2;

/** One recipe for a radio row, so the eight of them cannot drift apart. */
const RADIO_ROW =
  'flex cursor-pointer items-center gap-2 rounded-input border border-glass-hairline bg-white/55 p-3 ' +
  'transition-[border-color,background-color] duration-quick ease-settle hover:border-brand/40 hover:bg-white/80';

export default function ConfigureExtractionDialog({ job, isOpen, onClose, onSubmit }: Props) {
  const [pageRangeMode, setPageRangeMode] = useState<PageRangeMode>('missing');
  const [checkRangeMode, setCheckRangeMode] = useState<CheckRangeMode>('failed');
  const [customPageFrom, setCustomPageFrom] = useState(1);
  const [customPageTo, setCustomPageTo] = useState(1);
  const [customCheckFrom, setCustomCheckFrom] = useState(1);
  const [customCheckTo, setCustomCheckTo] = useState(1);
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Analyze job to find missing checks and pages
  const analysis = useMemo(() => {
    const checks = job.checks || [];
    const missingChecks = checks.filter(
      (c) => !c.extraction || Object.keys(c.extraction).length === 0
    );
    const extractedCount = checks.length - missingChecks.length;

    // Find pages with missing checks
    const pagesWithMissing = new Set(missingChecks.map((c) => c.page));
    const missingPages = Array.from(pagesWithMissing).sort((a, b) => a - b);
    const minMissingPage = missingPages.length > 0 ? missingPages[0] : 1;
    const maxMissingPage = missingPages.length > 0 ? missingPages[missingPages.length - 1] : job.total_pages;

    return {
      totalChecks: checks.length,
      extractedCount,
      missingCount: missingChecks.length,
      missingPages,
      minMissingPage,
      maxMissingPage,
    };
  }, [job]);

  // Initialize defaults when dialog opens
  useEffect(() => {
    if (isOpen) {
      setForce(false);

      // Default to missing pages if any exist
      if (analysis.missingCount > 0) {
        setPageRangeMode('missing');
        setCheckRangeMode('failed');
        setCustomPageFrom(analysis.minMissingPage);
        setCustomPageTo(analysis.maxMissingPage);
        setCustomCheckFrom(1);
        setCustomCheckTo(analysis.totalChecks);
      } else {
        setPageRangeMode('all');
        setCheckRangeMode('all');
        setCustomPageFrom(1);
        setCustomPageTo(job.total_pages);
        setCustomCheckFrom(1);
        setCustomCheckTo(analysis.totalChecks);
      }
    }
  }, [isOpen, analysis, job.total_pages]);

  // Calculate estimated time
  const estimatedTime = useMemo(() => {
    let checkCount = 0;

    if (checkRangeMode === 'all') {
      checkCount = analysis.totalChecks;
    } else if (checkRangeMode === 'failed') {
      checkCount = analysis.missingCount;
    } else {
      checkCount = Math.max(0, customCheckTo - customCheckFrom + 1);
    }

    const totalSeconds = checkCount * SECONDS_PER_CHECK;

    if (totalSeconds < 60) {
      return `~${totalSeconds} seconds`;
    }
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  }, [checkRangeMode, analysis, customCheckFrom, customCheckTo]);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const config: ExtractionConfig = {
      job_id: job.job_id,
      methods: [EXTRACTION_METHOD],
      force,
      page_range: null,
      cheque_range: null,
    };

    // Set page range
    if (pageRangeMode === 'missing') {
      config.page_range = { from: analysis.minMissingPage, to: analysis.maxMissingPage };
    } else if (pageRangeMode === 'custom') {
      config.page_range = { from: customPageFrom, to: customPageTo };
    }

    // Set check range
    if (checkRangeMode === 'custom') {
      config.cheque_range = { from: customCheckFrom, to: customCheckTo };
    }
    // Note: 'failed' mode is handled by backend when cheque_range is null and force=false

    onSubmit(config);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="xl"
      title="Configure Extraction"
      description={job.pdf_name}
      className="max-h-[90vh] overflow-hidden"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            loading={isSubmitting}
            icon={<Play size={16} />}
          >
            {isSubmitting ? 'Starting...' : 'Start Extraction'}
          </Button>
        </>
      }
    >
      <div className="scroll-region max-h-[62vh] space-y-5 pr-1">
        {/* Stats — inset group, no blur of its own. */}
        <GlassPanel tone="sunken" radius="input" padding="md" className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-faint">Total:</span>
            <span className="nums font-medium text-ink-strong">{job.total_pages} pages, {analysis.totalChecks} checks detected</span>
          </div>
          {analysis.missingCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-faint">Extracted:</span>
              <span className="nums font-medium text-ink-strong">
                {analysis.extractedCount}/{analysis.totalChecks} checks
                <span className="ml-1 text-warning-text">({analysis.missingCount} missing)</span>
              </span>
            </div>
          )}
        </GlassPanel>

        {/* Page Range */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink-body">Page Range</span>
          <div className="space-y-2">
            <label className={RADIO_ROW}>
              <input
                type="radio"
                name="pageRange"
                checked={pageRangeMode === 'all'}
                onChange={() => setPageRangeMode('all')}
              />
              <span className="nums text-sm text-ink-strong">All pages (1-{job.total_pages})</span>
            </label>

            {analysis.missingPages.length > 0 && (
              <label className={`${RADIO_ROW} items-start`}>
                <input
                  type="radio"
                  name="pageRange"
                  checked={pageRangeMode === 'missing'}
                  onChange={() => setPageRangeMode('missing')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="nums text-sm text-ink-strong">
                    Pages with missing checks: {analysis.minMissingPage} to {analysis.maxMissingPage}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    {analysis.missingPages.length} page{analysis.missingPages.length > 1 ? 's' : ''} need extraction
                  </div>
                </div>
              </label>
            )}

            <label className={RADIO_ROW}>
              <input
                type="radio"
                name="pageRange"
                checked={pageRangeMode === 'custom'}
                onChange={() => setPageRangeMode('custom')}
              />
              <span className="mr-2 text-sm text-ink-strong">Custom range:</span>
              <Input
                type="number"
                inputSize="sm"
                min={1}
                max={job.total_pages}
                value={customPageFrom}
                onChange={(e) => setCustomPageFrom(Math.max(1, Math.min(job.total_pages, parseInt(e.target.value) || 1)))}
                onClick={() => setPageRangeMode('custom')}
                className="nums w-16"
              />
              <span className="text-sm text-ink-faint">to</span>
              <Input
                type="number"
                inputSize="sm"
                min={1}
                max={job.total_pages}
                value={customPageTo}
                onChange={(e) => setCustomPageTo(Math.max(1, Math.min(job.total_pages, parseInt(e.target.value) || 1)))}
                onClick={() => setPageRangeMode('custom')}
                className="nums w-16"
              />
            </label>
          </div>
        </div>

        {/* Check Range */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-ink-body">Check Range</span>
          <div className="space-y-2">
            <label className={RADIO_ROW}>
              <input
                type="radio"
                name="checkRange"
                checked={checkRangeMode === 'all'}
                onChange={() => setCheckRangeMode('all')}
              />
              <span className="nums text-sm text-ink-strong">All checks (1-{analysis.totalChecks})</span>
            </label>

            {analysis.missingCount > 0 && (
              <label className={RADIO_ROW}>
                <input
                  type="radio"
                  name="checkRange"
                  checked={checkRangeMode === 'failed'}
                  onChange={() => setCheckRangeMode('failed')}
                />
                <span className="nums text-sm text-ink-strong">
                  Failed/missing checks only ({analysis.missingCount} check{analysis.missingCount > 1 ? 's' : ''})
                </span>
              </label>
            )}

            <label className={RADIO_ROW}>
              <input
                type="radio"
                name="checkRange"
                checked={checkRangeMode === 'custom'}
                onChange={() => setCheckRangeMode('custom')}
              />
              <span className="mr-2 text-sm text-ink-strong">Custom range:</span>
              <Input
                type="number"
                inputSize="sm"
                min={1}
                max={analysis.totalChecks}
                value={customCheckFrom}
                onChange={(e) => setCustomCheckFrom(Math.max(1, Math.min(analysis.totalChecks, parseInt(e.target.value) || 1)))}
                onClick={() => setCheckRangeMode('custom')}
                className="nums w-16"
              />
              <span className="text-sm text-ink-faint">to</span>
              <Input
                type="number"
                inputSize="sm"
                min={1}
                max={analysis.totalChecks}
                value={customCheckTo}
                onChange={(e) => setCustomCheckTo(Math.max(1, Math.min(analysis.totalChecks, parseInt(e.target.value) || 1)))}
                onClick={() => setCheckRangeMode('custom')}
                className="nums w-16"
              />
            </label>
          </div>
        </div>

        {/* Force Re-extract */}
        <label className="flex cursor-pointer items-center gap-2 rounded-input border border-warning-border bg-warning-bg p-3">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-warning-text">Force re-extract (overwrite existing results)</div>
            <div className="mt-0.5 text-xs text-warning-text/80">This will re-process all checks in the selected range, even if they already have extraction data</div>
          </div>
        </label>

        {/* Estimated Time */}
        <div className="flex items-center gap-2 rounded-input border border-info-border bg-info-bg p-3">
          <AlertCircle size={16} className="shrink-0 text-info-text" />
          <div className="text-sm text-info-text">
            <span className="font-medium">Estimated time:</span> {estimatedTime}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
