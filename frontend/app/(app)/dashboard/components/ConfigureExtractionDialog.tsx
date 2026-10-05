'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Play, AlertCircle } from 'lucide-react';

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

    const secondsPerCheck = SECONDS_PER_CHECK;
    const totalSeconds = checkCount * secondsPerCheck;

    if (totalSeconds < 60) {
      return `~${totalSeconds} seconds`;
    } else {
      const minutes = Math.ceil(totalSeconds / 60);
      return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configure Extraction</h2>
            <p className="text-xs text-gray-500 mt-0.5">{job.pdf_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded transition">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Stats */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total:</span>
              <span className="font-medium text-gray-900">{job.total_pages} pages, {analysis.totalChecks} checks detected</span>
            </div>
            {analysis.missingCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Extracted:</span>
                <span className="font-medium text-gray-900">
                  {analysis.extractedCount}/{analysis.totalChecks} checks 
                  <span className="text-amber-600 ml-1">({analysis.missingCount} missing)</span>
                </span>
              </div>
            )}
          </div>

          {/* Page Range */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Page Range</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                <input
                  type="radio"
                  name="pageRange"
                  checked={pageRangeMode === 'all'}
                  onChange={() => setPageRangeMode('all')}
                />
                <span className="text-sm text-gray-900">All pages (1-{job.total_pages})</span>
              </label>
              
              {analysis.missingPages.length > 0 && (
                <label className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                  <input
                    type="radio"
                    name="pageRange"
                    checked={pageRangeMode === 'missing'}
                    onChange={() => setPageRangeMode('missing')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-gray-900">
                      Pages with missing checks: {analysis.minMissingPage} to {analysis.maxMissingPage}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {analysis.missingPages.length} page{analysis.missingPages.length > 1 ? 's' : ''} need extraction
                    </div>
                  </div>
                </label>
              )}

              <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                <input
                  type="radio"
                  name="pageRange"
                  checked={pageRangeMode === 'custom'}
                  onChange={() => setPageRangeMode('custom')}
                />
                <span className="text-sm text-gray-900 mr-2">Custom range:</span>
                <input
                  type="number"
                  min={1}
                  max={job.total_pages}
                  value={customPageFrom}
                  onChange={(e) => setCustomPageFrom(Math.max(1, Math.min(job.total_pages, parseInt(e.target.value) || 1)))}
                  onClick={() => setPageRangeMode('custom')}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <span className="text-sm text-gray-500">to</span>
                <input
                  type="number"
                  min={1}
                  max={job.total_pages}
                  value={customPageTo}
                  onChange={(e) => setCustomPageTo(Math.max(1, Math.min(job.total_pages, parseInt(e.target.value) || 1)))}
                  onClick={() => setPageRangeMode('custom')}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </label>
            </div>
          </div>

          {/* Check Range */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Check Range</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                <input
                  type="radio"
                  name="checkRange"
                  checked={checkRangeMode === 'all'}
                  onChange={() => setCheckRangeMode('all')}
                />
                <span className="text-sm text-gray-900">All checks (1-{analysis.totalChecks})</span>
              </label>

              {analysis.missingCount > 0 && (
                <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                  <input
                    type="radio"
                    name="checkRange"
                    checked={checkRangeMode === 'failed'}
                    onChange={() => setCheckRangeMode('failed')}
                  />
                  <span className="text-sm text-gray-900">
                    Failed/missing checks only ({analysis.missingCount} check{analysis.missingCount > 1 ? 's' : ''})
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer transition">
                <input
                  type="radio"
                  name="checkRange"
                  checked={checkRangeMode === 'custom'}
                  onChange={() => setCheckRangeMode('custom')}
                />
                <span className="text-sm text-gray-900 mr-2">Custom range:</span>
                <input
                  type="number"
                  min={1}
                  max={analysis.totalChecks}
                  value={customCheckFrom}
                  onChange={(e) => setCustomCheckFrom(Math.max(1, Math.min(analysis.totalChecks, parseInt(e.target.value) || 1)))}
                  onClick={() => setCheckRangeMode('custom')}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <span className="text-sm text-gray-500">to</span>
                <input
                  type="number"
                  min={1}
                  max={analysis.totalChecks}
                  value={customCheckTo}
                  onChange={(e) => setCustomCheckTo(Math.max(1, Math.min(analysis.totalChecks, parseInt(e.target.value) || 1)))}
                  onClick={() => setCheckRangeMode('custom')}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </label>
            </div>
          </div>

          {/* Force Re-extract */}
          <label className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-amber-900">Force re-extract (overwrite existing results)</div>
              <div className="text-xs text-amber-700 mt-0.5">This will re-process all checks in the selected range, even if they already have extraction data</div>
            </div>
          </label>

          {/* Estimated Time */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-blue-600 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <span className="font-medium">Estimated time:</span> {estimatedTime}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play size={16} />
                Start Extraction
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
