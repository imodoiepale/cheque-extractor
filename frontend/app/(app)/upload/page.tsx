'use client';

import { createClient } from '@/lib/supabase/client';
import { Suspense, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DropzoneUpload from './components/DropzoneUpload';
import PageSelectGrid, {
  defaultPageSelection,
  selectedRange,
} from './components/PageSelectGrid';
import {
  Upload, FileText, Image as ImageIcon, Loader2, CheckCircle,
  ChevronRight, ChevronLeft, Eye, LayoutGrid, List, ZoomIn, ZoomOut,
  Settings2, Play, X, AlertCircle, HardDrive, CreditCard,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  IconButton,
  Input,
  KpiTile,
  Table,
  TableScroll,
  TableShell,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────
interface CheckInfo {
  check_id: string;
  page: number;
  width: number;
  height: number;
}

interface AnalyzeResult {
  job_id: string;
  pdf_name: string;
  file_size: number;
  doc_format: string;
  total_pages: number;
  total_checks: number;
  pages: PageInfo[];
  checks: CheckInfo[];
  isDuplicate?: boolean;
}

interface PageInfo {
  page_number: number;
  width: number;
  height: number;
  checks_on_page: number;
  image_url?: string;
}

type JobStatus = 'uploading' | 'analyzed' | 'extracting' | 'complete' | 'error';

interface JobEntry {
  id: string;
  file: File;
  status: JobStatus;
  error?: string;
  result?: AnalyzeResult;
}

type Step = 'upload' | 'preview' | 'configure' | 'starting';
type ViewMode = 'card' | 'table';
type RangeType = 'all' | 'pages' | 'cheques';

/** One pending "you uploaded this before" question, awaiting the reader. */
interface ReuploadAsk {
  key: string;
  fileName: string;
  previousUploadedAt: string | null;
  resolve: (proceed: boolean) => void;
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Kyriq picks the engine; the user is never asked. Michael, 21 Sep: "The software
// should just extract the data they need" — no OCR, image or confidence settings.
const EXTRACTION_METHODS = ['ai'] as const;

/** The upload was blocked by the trial or billing gate — never fall back past this. */
class ProcessingBlocked extends Error {
  constructor(public readonly detail: Record<string, any>) {
    const parts: string[] = [];
    if (detail?.reason === 'trial_expired') parts.push('Your 14-day trial has ended.');
    else if (detail?.reason === 'trial_check_limit_reached') parts.push('You have used all 250 trial cheques.');
    else if (detail?.reason) parts.push('Processing is currently paused.');
    if (typeof detail?.checksRemaining === 'number') parts.push(`${detail.checksRemaining} cheques remaining.`);
    super(parts.join(' ') || detail?.message || 'Processing is not available on your plan right now.');
    this.name = 'ProcessingBlocked';
  }
}

/** The user declined to re-process a file they had uploaded before. */
class DuplicateSkipped extends Error {
  constructor(fileName: string) {
    super(`${fileName} was already uploaded and was not processed again.`);
    this.name = 'DuplicateSkipped';
  }
}

const STEP_ORDER: ('upload' | 'preview' | 'configure')[] = ['upload', 'preview', 'configure'];
const STEP_LABELS: Record<string, string> = { upload: 'Upload', preview: 'Preview', configure: 'Configure & Extract' };

/** Status dot for the multi-job strip. Colour marks state only (rule 10). */
const STATUS_DOT: Record<JobStatus, string> = {
  uploading: 'bg-brand-light',
  analyzed: 'bg-success',
  extracting: 'bg-warning animate-pulse',
  complete: 'bg-success-dark',
  error: 'bg-error',
};

/** Zoom + paging controls, shared by the page viewer and the cheque viewer. */
function ViewerToolbar({
  zoom,
  onZoom,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  zoom: number;
  onZoom: (next: number) => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-1 border-b border-glass-hairline pb-3">
      <IconButton
        aria-label="Zoom out"
        size="icon-sm"
        onClick={() => onZoom(Math.max(0.25, zoom - 0.25))}
        disabled={zoom <= 0.25}
      >
        <ZoomOut size={14} />
      </IconButton>
      <span className="nums min-w-[2.75rem] text-center text-xs font-medium text-ink-body">
        {(zoom * 100).toFixed(0)}%
      </span>
      <IconButton
        aria-label="Zoom in"
        size="icon-sm"
        onClick={() => onZoom(Math.min(3, zoom + 0.25))}
        disabled={zoom >= 3}
      >
        <ZoomIn size={14} />
      </IconButton>
      <div className="mx-1 h-4 w-px bg-glass-hairline" />
      <IconButton aria-label="Previous" size="icon-sm" onClick={onPrev} disabled={!canPrev}>
        <ChevronLeft size={16} />
      </IconButton>
      <IconButton aria-label="Next" size="icon-sm" onClick={onNext} disabled={!canNext}>
        <ChevronRight size={16} />
      </IconButton>
    </div>
  );
}

/**
 * useSearchParams opts the subtree out of prerendering, so it has to sit under
 * a Suspense boundary or `next build` fails on this route. Same shape as
 * /reconcile, which reads `?batch=` for the same reason.
 */
export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const router = useRouter();
  /**
   * Step 1 of /reconcile sends the user here as `/upload?batch=<id>`, and
   * start-extraction attaches the job to that batch. Without this the job is
   * created unattached, the batch's `jobs_complete` and `checks_total` stay at
   * zero, step 1 never completes and the stepper cannot advance — which is
   * exactly how it behaved before: the link and the API both carried the batch,
   * and only this read was missing.
   */
  const searchParams = useSearchParams();
  const batchId = searchParams?.get('batch') || null;

  // ── Step state ───────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** ProcessingBlocked's message, surfaced in the UI rather than only thrown. */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<Record<string, string[]>>({});

  // ── Multi-job state ────────────────────────────────────────
  const [jobEntries, setJobEntries] = useState<JobEntry[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // ── Re-upload confirmations, queued so two concurrent 409s both get asked ──
  const [reuploadQueue, setReuploadQueue] = useState<ReuploadAsk[]>([]);

  // ── Preview state ────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // ── Extraction config ────────────────────────────────────
  const [rangeType, setRangeType] = useState<RangeType>('all');
  // Explicit per-page selection. Defaults to the pages where detection found
  // cheques; billing counts cheques, so this must never be guessed wider.
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [chequeFrom, setChequeFrom] = useState(1);
  const [chequeTo, setChequeTo] = useState(1);
  const [forceExtract, setForceExtract] = useState(false);

  // ── Derived from active job ────────────────────────────────
  const activeJob = jobEntries.find((j) => j.id === activeJobId);
  const analyzeResult = activeJob?.result || null;
  const pages = analyzeResult?.pages || [];
  const totalPages = analyzeResult?.total_pages || 0;
  const totalChecks = analyzeResult?.total_checks || 0;
  const reuploadAsk = reuploadQueue[0];

  // ── Helpers ────────────────────────────────────────────────
  /** Resolves when the reader answers the dialog. Replaces window.confirm. */
  const askReupload = useCallback(
    (fileName: string, previousUploadedAt: string | null) =>
      new Promise<boolean>((resolve) => {
        setReuploadQueue((q) => [
          ...q,
          { key: `${fileName}:${q.length}:${Date.now()}`, fileName, previousUploadedAt, resolve },
        ]);
      }),
    []
  );

  /** Answer the head of the queue. Dismissing counts as declining, as cancel did. */
  const answerReupload = (proceed: boolean) => {
    reuploadAsk?.resolve(proceed);
    setReuploadQueue((q) => q.slice(1));
  };

  const hydrateJobResult = useCallback(async (jobId: string, fallbackFile: File, fallbackDuplicate = false) => {
    const response = await fetch(`/api/jobs/${jobId}?source=db`);
    if (!response.ok) {
      throw new Error('Failed to load saved document details');
    }

    const job = await response.json();
    const checks = Array.isArray(job.checks) ? job.checks : [];
    const derivedTotalPages = Number(job.total_pages) || 0;
    const pageCount = derivedTotalPages > 0
      ? derivedTotalPages
      : checks.reduce((max: number, check: any) => Math.max(max, Number(check.page) || 0), 0);

    const checksPerPage = new Map<number, number>();
    for (const check of checks) {
      const pageNumber = Number(check.page) || 0;
      if (pageNumber > 0) {
        checksPerPage.set(pageNumber, (checksPerPage.get(pageNumber) || 0) + 1);
      }
    }

    const hydratedPages: PageInfo[] = Array.from({ length: Math.max(pageCount, 1) }, (_, index) => ({
      page_number: index + 1,
      width: 0,
      height: 0,
      checks_on_page: checksPerPage.get(index + 1) || 0,
    }));

    return {
      job_id: job.job_id || jobId,
      pdf_name: job.pdf_name || fallbackFile.name,
      file_size: fallbackFile.size || 0,
      doc_format: job.doc_format || 'Auto',
      total_pages: pageCount,
      total_checks: Number(job.total_checks) || checks.length,
      pages: hydratedPages,
      checks: checks.map((check: any) => ({
        check_id: check.check_id,
        page: Number(check.page) || 1,
        width: Number(check.width) || 0,
        height: Number(check.height) || 0,
      })),
      isDuplicate: fallbackDuplicate,
    } as AnalyzeResult;
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<JobEntry>) => {
    setJobEntries((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const pollJobProgress = useCallback(async (jobId: string, entryId: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';
    const maxPolls = 60; // Poll for up to 60 seconds
    let pollCount = 0;
    let lastStatus = '';

    const poll = async () => {
      if (pollCount >= maxPolls) return;
      pollCount++;

      try {
        const response = await fetch(`${backendUrl}/api/jobs/${jobId}`);
        if (response.ok) {
          const jobData = await response.json();

          // Build detailed progress messages
          const messages: string[] = [];

          // Status-based messages with real-time updates
          if (jobData.status === 'pending') {
            messages.push('Uploading PDF...');
          } else if (jobData.status === 'analyzing') {
            messages.push('Converting PDF to images...');
          } else if (jobData.status === 'detecting') {
            messages.push('Detecting cheques on pages...');
          } else if (jobData.status === 'extracting') {
            messages.push('Extracting cheque images...');
          } else if (jobData.status === 'ocr_running') {
            messages.push('Reading the cheques...');
          } else if (jobData.status === 'analyzed') {
            messages.push('Analysis complete');
          } else if (jobData.status === 'complete') {
            messages.push('Extraction complete');
          }

          // Show page conversion progress
          if (jobData.total_pages > 0) {
            messages.push(`${jobData.total_pages} pages converted`);
            if (jobData.doc_format) {
              messages.push(`Format: ${jobData.doc_format}`);
            }
          }

          // Show check detection progress
          if (jobData.total_checks > 0) {
            messages.push(`${jobData.total_checks} cheques detected`);
          }

          // Show per-page detection if available
          if (jobData.pages && Array.isArray(jobData.pages) && jobData.pages.length > 0) {
            const pagesWithChecks = jobData.pages.filter((p: any) => p.checks_on_page > 0);
            if (pagesWithChecks.length > 0 && pagesWithChecks.length <= 5) {
              // Show first few pages with check counts
              pagesWithChecks.slice(0, 5).forEach((p: any) => {
                messages.push(`Page ${p.page_number}: ${p.checks_on_page} cheques`);
              });
            }
          }

          // Only update if messages changed
          const newStatus = messages.join('|');
          if (newStatus !== lastStatus) {
            setProgressMessages(prev => ({ ...prev, [entryId]: messages }));
            lastStatus = newStatus;
          }

          // If complete, stop polling
          if (jobData.status === 'analyzed' || jobData.status === 'complete') {
            return;
          }
        }
      } catch (err) {
        console.error('Progress poll error:', err);
      }

      // Continue polling every 500ms for faster updates
      setTimeout(poll, 500);
    };

    poll();
  }, []);

  const analyzeOneFile = useCallback(async (file: File, entryId: string) => {
    const formData = new FormData();
    formData.append('file', file);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3090';

    let data: any;
    let isDuplicate = false;

    // Set initial progress message
    setProgressMessages(prev => ({ ...prev, [entryId]: ['Uploading PDF...'] }));

    try {
      // Through the Next proxy, not straight at the Python backend. The proxy
      // carries the session, which is what lets the backend resolve the tenant,
      // stamp tenant_id on the job and record the upload fingerprint that backs
      // the duplicate warning. Called directly, every one of those was missing.
      let response = await fetch('/api/upload-analyze', {
        method: 'POST',
        body: formData,
      });

      // Michael, 30 Sep: warn that the file went up before, and let them opt in
      // to processing it again knowing it counts against their monthly checks.
      if (response.status === 409) {
        const dup = await response.json().catch(() => ({} as any));
        const proceed = await askReupload(file.name, dup.previous_uploaded_at ?? null);
        if (!proceed) {
          setProgressMessages(prev => ({ ...prev, [entryId]: ['Skipped — already uploaded'] }));
          throw new DuplicateSkipped(file.name);
        }
        response = await fetch('/api/upload-analyze?confirm_reupload=true', {
          method: 'POST',
          body: formData,
        });
      }

      // A trial or payment block must stop here. Falling through to the
      // unauthenticated direct-to-backend path below would bypass the gate.
      if (response.status === 402 || response.status === 401) {
        const blockedDetail = await response.json().catch(() => ({} as any));
        throw new ProcessingBlocked(blockedDetail);
      }

      if (response.ok) {
        data = await response.json();
        isDuplicate = data.duplicate === true;

        // Start polling for progress if we have a job_id
        if (data.job_id) {
          pollJobProgress(data.job_id, entryId);
        }
      } else {
        throw new Error('analyze endpoint unavailable');
      }
    } catch (analyzeErr) {
      if (analyzeErr instanceof ProcessingBlocked || analyzeErr instanceof DuplicateSkipped) {
        throw analyzeErr;
      }
      setProgressMessages(prev => ({ ...prev, [entryId]: ['Converting PDF to images...'] }));

      const formData2 = new FormData();
      formData2.append('file', file);
      const { data: { session: uploadSession } } = await createClient().auth.getSession();
      const response = await fetch(`${backendUrl}/api/upload-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${uploadSession?.access_token || ''}` },
        body: formData2,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      data = await response.json();
      isDuplicate = data.duplicate === true;

      // Start polling for progress
      if (data.job_id || data.id) {
        pollJobProgress(data.job_id || data.id, entryId);
      }
    }

    const jobId = data.job_id || data.id;

    // Wait for backend to complete Phase 1 (check detection)
    // Poll until status is 'analyzed' or 'complete'
    if (jobId && !isDuplicate) {
      let attempts = 0;
      const maxAttempts = 120; // 60 seconds max (500ms * 120)

      while (attempts < maxAttempts) {
        try {
          const statusRes = await fetch(`${backendUrl}/api/jobs/${jobId}`);
          if (statusRes.ok) {
            const jobData = await statusRes.json();

            // Check if Phase 1 is complete: status is 'analyzed' OR we have real page+check data
            // Fixed: was total_checks >= 0 (always true), now total_checks > 0
            if (jobData.status === 'analyzed' || jobData.status === 'complete' ||
                (jobData.total_pages > 0 && jobData.total_checks > 0)) {
              data = jobData; // Use the complete data
              break;
            }
          }
        } catch (pollErr) {
          console.error('Status poll error:', pollErr);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.warn('Timeout waiting for Phase 1 completion');
      }
    }

    if (isDuplicate && (data.job_id || data.id)) {
      try {
        return await hydrateJobResult(data.job_id || data.id, file, true);
      } catch (hydrateError) {
        console.warn('Failed to hydrate duplicate job details:', hydrateError);
      }
    }

    const result: AnalyzeResult = {
      job_id: data.job_id || data.id || '',
      pdf_name: data.pdf_name || file.name,
      file_size: data.file_size || file.size || 0,
      doc_format: data.doc_format || 'Auto',
      total_pages: data.total_pages || data.pages?.length || 1,
      total_checks: data.total_checks || data.checks?.length || 0,
      pages: data.pages || Array.from(
        { length: data.total_pages || 1 },
        (_, i) => ({ page_number: i + 1, width: 0, height: 0, checks_on_page: 0 })
      ),
      checks: data.checks || [],
      isDuplicate,
    };

    // A re-uploaded duplicate used to auto-extract here. Same bug as the
    // multi-file path: it ran before the user could reach Configure, so every
    // page was billed regardless of the selection they were about to make.
    // It now waits for Start like any other job.

    return result;
  }, [askReupload]);

  // ── Handlers ─────────────────────────────────────────────
  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAndAnalyze = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setBlocked(null);

    const entries: JobEntry[] = files.map((file, i) => ({
      id: `pending_${Date.now()}_${i}`,
      file,
      status: 'uploading' as JobStatus,
    }));
    setJobEntries(entries);

    const settled = await Promise.allSettled(
      entries.map(async (entry) => {
        try {
          const result = await analyzeOneFile(entry.file, entry.id);
          setJobEntries((prev) =>
            prev.map((j) =>
              j.id === entry.id
                ? { ...j, id: result.job_id, status: 'analyzed', result }
                : j
            )
          );
          return result;
        } catch (err: any) {
          setJobEntries((prev) =>
            prev.map((j) =>
              j.id === entry.id
                ? { ...j, status: 'error', error: err.message || 'Upload failed' }
                : j
            )
          );
          throw err;
        }
      })
    );

    const firstSuccess = settled.find((s) => s.status === 'fulfilled') as
      | PromiseFulfilledResult<AnalyzeResult>
      | undefined;

    const rejections = settled
      .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
      .map((s) => s.reason);

    // The billing gate is the one failure that gets its own banner — "try
    // again" is the wrong instruction when retrying cannot possibly work.
    const gate = rejections.find((r) => r instanceof ProcessingBlocked) as ProcessingBlocked | undefined;
    if (gate) setBlocked(gate.message);

    if (firstSuccess) {
      setActiveJobId(firstSuccess.value.job_id);
      setSelectedPages(defaultPageSelection(firstSuccess.value.pages || []));
      setChequeTo(firstSuccess.value.total_checks || 1);
      setStep('preview');
      // Deliberately NO auto-extract here. Usage is billed per cheque
      // processed, and the per-page grid in Configure exists so the user can
      // exclude the non-cheque pages of a bank statement. Firing extraction
      // before they reach that step would bill pages they never chose.
      // Extraction starts when the user presses Start (or Extract All).
    } else if (!gate) {
      const allSkipped =
        rejections.length > 0 && rejections.every((r) => r instanceof DuplicateSkipped);
      setError(
        allSkipped
          ? 'Nothing was processed — every file had already been uploaded.'
          : 'All uploads failed. Please try again.'
      );
    }

    setUploading(false);
  };

  const handleSelectJob = (jobId: string) => {
    setActiveJobId(jobId);
    const job = jobEntries.find((j) => j.id === jobId);
    if (job?.result) {
      setSelectedPages(defaultPageSelection(job.result.pages || []));
      setChequeTo(job.result.total_checks || 1);
      setChequeFrom(1);
      setRangeType('all');
      setSelectedPage(null);
      setSelectedCheck(null);
    }
  };


  const handleStartExtraction = async (targetJobId?: string) => {
    const jobId = targetJobId || analyzeResult?.job_id;
    if (!jobId) return;
    const job = jobEntries.find((j) => j.id === jobId);
    if (!job?.result) return;

    updateJob(jobId, { status: 'extracting' });
    if (jobId === activeJobId) setStep('starting');
    setError(null);

    try {
      const r = job.result;
      const methodsToRun = [...EXTRACTION_METHODS];

      const body: Record<string, unknown> = {
        job_id: jobId,
        methods: methodsToRun,
        force: forceExtract,
        // Only when we arrived from the reconcile stepper. A plain /upload
        // visit sends nothing and the job stays unattached, which is correct.
        ...(batchId ? { batch_id: batchId } : {}),
      };
      // The per-page selection belongs to the job on screen. Other jobs in an
      // "Extract All" run get everything, which is what their own default is.
      if (rangeType === 'pages' && jobId === activeJobId) {
        const sel = selectedPages;
        if (sel.size === 0) throw new Error('Select at least one page to extract.');
        // `pages` is the real instruction and the backend prefers it, so a
        // statement whose cheque pages are not consecutive runs as selected.
        // page_range still goes along as the contiguous envelope: it is what an
        // older extractor would fall back to, and for a contiguous selection
        // the two agree exactly. Usage is billed on cheques detected, so the
        // list must never be widened silently.
        body.pages = [...sel].sort((a, b) => a - b);
        body.page_range = selectedRange(sel);
      } else if (rangeType === 'cheques' && jobId === activeJobId) {
        body.cheque_range = { from: chequeFrom, to: chequeTo };
      } else if (jobId === activeJobId) {
        // The user explicitly chose "All pages" for the job on screen.
        body.page_range = { from: 1, to: r.total_pages };
      } else {
        // An "Extract All" sibling: nobody has reviewed its pages, so it runs
        // on its OWN default selection (pages where detection found cheques),
        // not on every page. Billing is per cheque processed.
        const sel = defaultPageSelection(r.pages || []);
        body.pages = [...sel].sort((a, b) => a - b);
        body.page_range = sel.size > 0 ? selectedRange(sel) : { from: 1, to: r.total_pages };
      }

      const response = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start extraction');
      }

      updateJob(jobId, { status: 'complete' });
      const methodsParam = methodsToRun.join(',');
      router.push(`/process/${jobId}?methods=${methodsParam}`);
    } catch (err: any) {
      console.error('Start extraction error:', err);
      updateJob(jobId, { status: 'error', error: err.message });
      setError(err.message || 'Failed to start extraction');
      if (jobId === activeJobId) setStep('configure');
    }
  };

  const handleExtractAll = async () => {
    const analyzedJobs = jobEntries.filter((j) => j.status === 'analyzed' && j.result);
    if (analyzedJobs.length === 0) return;
    await Promise.allSettled(
      analyzedJobs.map((job) => handleStartExtraction(job.id))
    );
  };

  // ── Step indicator helpers ─────────────────────────────────
  const currentStepIdx = STEP_ORDER.indexOf(step === 'starting' ? 'configure' : step);

  // ── Multi-job strip, rendered identically in preview and configure ───────
  const jobStrip = jobEntries.length > 1 && (
    <div className="scroll-region flex items-center gap-2 overflow-x-auto pb-1">
      {jobEntries.map((entry) => {
        const isActive = entry.id === activeJobId;
        return (
          <Button
            key={entry.id}
            size="sm"
            variant={isActive ? 'secondary' : 'ghost'}
            onClick={() => handleSelectJob(entry.id)}
            aria-current={isActive || undefined}
            className={cn('shrink-0 font-medium', isActive && 'glass-selected')}
            icon={<span className={cn('h-2 w-2 rounded-full', STATUS_DOT[entry.status])} />}
          >
            {entry.result?.pdf_name || entry.file.name}
            {entry.result && (
              <span className="nums text-xs text-ink-faint">{entry.result.total_checks} chq</span>
            )}
          </Button>
        );
      })}
    </div>
  );

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5">
      {/* ── Step indicator ──────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => {
          const isCurrent = i === currentStepIdx;
          const isDone = i < currentStepIdx;
          return (
            <div key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-ink-faint" aria-hidden />}
              <Badge
                size="sm"
                tone={isCurrent ? 'solid' : isDone ? 'success' : 'outline'}
                className={cn('py-1', !isCurrent && !isDone && 'text-ink-faint')}
                aria-current={isCurrent || undefined}
              >
                {isDone ? (
                  <CheckCircle size={12} aria-hidden />
                ) : (
                  <span className="nums flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] border-current text-[9px] font-bold">
                    {i + 1}
                  </span>
                )}
                {STEP_LABELS[s]}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* ── Trial / billing gate ────────────────────────── */}
      {blocked && (
        <GlassPanel
          role="alert"
          radius="input"
          padding="sm"
          className="flex items-start gap-2.5 border-warning-border bg-warning-bg/50"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-text" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning-text">Processing is paused</p>
            <p className="mt-0.5 text-sm text-ink-body">{blocked}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<CreditCard size={14} />}
            onClick={() => router.push('/billing')}
            className="shrink-0"
          >
            View billing
          </Button>
        </GlassPanel>
      )}

      {/* ── Error banner ────────────────────────────────── */}
      {error && (
        <GlassPanel
          role="alert"
          radius="input"
          padding="sm"
          className="flex items-center gap-2 border-error-border bg-error-bg/50"
        >
          <AlertCircle size={14} className="shrink-0 text-error-text" aria-hidden />
          <span className="flex-1 text-sm text-ink-body">{error}</span>
          <IconButton aria-label="Dismiss error" size="icon-sm" onClick={() => setError(null)}>
            <X size={14} />
          </IconButton>
        </GlassPanel>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 1: UPLOAD
         ══════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <>
          <div>
            <h1 className="font-heading text-2xl font-semibold text-ink-strong">Upload Document</h1>
            <p className="mt-0.5 text-sm text-ink-body">
              Upload a PDF. We&apos;ll detect pages and cheques before extraction.
            </p>
          </div>

          <DropzoneUpload onFilesSelected={handleFilesSelected} />

          {files.length > 0 && (
            <div className="space-y-3">
              <GlassCard padding="none" className="overflow-hidden">
                <div className="border-b border-glass-hairline px-4 py-2.5">
                  <GlassCardTitle className="text-sm">Files ({files.length})</GlassCardTitle>
                </div>
                <div>
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="glass-divider flex items-center justify-between px-4 py-2.5 transition-colors duration-quick ease-settle hover:bg-brand/[0.045]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-input bg-brand-wash p-1.5">
                          <FileText className="text-brand-deep" size={14} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-strong">{file.name}</p>
                          <p className="nums text-xs text-ink-faint">{fmtSize(file.size)}</p>
                        </div>
                      </div>
                      <IconButton
                        aria-label={`Remove ${file.name}`}
                        size="icon-sm"
                        onClick={() => handleRemoveFile(index)}
                        className="text-ink-faint hover:text-error-text"
                      >
                        <X size={14} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* Progress Display During Upload */}
              {uploading && jobEntries.length > 0 && (
                <GlassPanel className="border-info-border bg-info-bg/40">
                  <div className="flex items-start gap-3">
                    <Loader2 className="mt-0.5 shrink-0 animate-spin text-brand" size={20} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="font-heading text-sm font-semibold text-ink-strong">
                          Processing documents…
                        </h3>
                        {files.reduce((sum, f) => sum + f.size, 0) > 5 * 1024 * 1024 && (
                          <Badge tone="brand" size="sm">
                            Large file — may take 1–2 minutes
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        {jobEntries.map((entry) => {
                          const messages = progressMessages[entry.id] || [];
                          return (
                            <div key={entry.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-4 text-xs">
                                <span className="max-w-[300px] truncate font-medium text-ink-strong">
                                  {entry.file.name}
                                </span>
                                <div className="flex shrink-0 items-center gap-3">
                                  {entry.status === 'uploading' && (
                                    <span className="flex items-center gap-1 text-ink-body">
                                      <Loader2 size={12} className="animate-spin" aria-hidden />
                                      {messages.length > 0 ? messages[messages.length - 1] : 'Analyzing…'}
                                    </span>
                                  )}
                                  {entry.status === 'analyzed' && entry.result && (
                                    <span className="nums flex items-center gap-2 font-semibold text-success-text">
                                      <CheckCircle size={12} aria-hidden />
                                      {entry.result.total_pages} pages, {entry.result.total_checks} cheques found
                                    </span>
                                  )}
                                  {entry.status === 'error' && (
                                    <span className="flex items-center gap-1 text-error-text">
                                      <AlertCircle size={12} aria-hidden />
                                      {entry.error || 'Failed'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Show all progress messages */}
                              {entry.status === 'uploading' && messages.length > 0 && (
                                <div className="ml-4 space-y-0.5">
                                  {messages.map((msg, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-xs text-ink-body">
                                      <span className="h-1 w-1 rounded-full bg-brand" aria-hidden />
                                      {msg}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Helpful tips during processing */}
                      <div className="mt-3 border-t border-glass-hairline pt-3">
                        <p className="text-xs text-ink-body">
                          <strong className="font-semibold text-ink-strong">Tip:</strong> Processing
                          time varies by file size.
                          {(() => {
                            const analyzing = jobEntries.filter(e => e.status === 'uploading').length;
                            const completed = jobEntries.filter(e => e.status === 'analyzed').length;
                            if (analyzing > 0 && completed > 0) {
                              return ` ${completed} of ${jobEntries.length} completed.`;
                            }
                            return ' You can continue working while we process in the background.';
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              )}

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setFiles([])} disabled={uploading}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleUploadAndAnalyze}
                  loading={uploading}
                  icon={<Upload size={14} />}
                >
                  {uploading
                    ? `Analyzing ${files.length} file${files.length > 1 ? 's' : ''}…`
                    : 'Upload & Analyze'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 2: PREVIEW — show pages, cheque count, images
         ══════════════════════════════════════════════════ */}
      {step === 'preview' && analyzeResult && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-semibold text-ink-strong">Document Preview</h1>
              <p className="mt-0.5 truncate text-sm text-ink-body">{analyzeResult.pdf_name}</p>
            </div>
            <Button
              size="sm"
              variant="link"
              onClick={() => setStep('upload')}
              icon={<ChevronLeft size={12} />}
            >
              Back
            </Button>
          </div>

          {/* ── Multi-job tabs ──────────────────────────── */}
          {jobStrip}

          {/* ── Action Buttons (Top) ──────────────────── */}
          <GlassCard padding="sm" className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={<ChevronLeft size={14} />}
                onClick={() => {
                  setStep('upload');
                  setActiveJobId(null);
                }}
              >
                Back to Upload
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<X size={14} />}
                onClick={() => router.push('/dashboard')}
              >
                Extract Later
              </Button>
            </div>
            <Button size="sm" onClick={() => setStep('configure')}>
              Continue to Configure
              <ChevronRight size={14} aria-hidden />
            </Button>
          </GlassCard>

          {/* ── Duplicate Warning Banner ──────────────── */}
          {analyzeResult.isDuplicate && (
            <GlassPanel
              radius="input"
              padding="sm"
              className="flex items-start gap-3 border-warning-border bg-warning-bg/50"
            >
              <AlertCircle className="mt-0.5 shrink-0 text-warning-text" size={20} aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="mb-1 font-heading text-sm font-semibold text-warning-text">
                  Duplicate Document Detected
                </h3>
                <p className="text-sm text-ink-body">
                  This file has already been uploaded. Using existing job{' '}
                  <span className="nums font-mono font-medium text-ink-strong">{analyzeResult.job_id}</span>.
                  {' '}Auto-extracting cheques in the background…
                </p>
              </div>
            </GlassPanel>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile
              tone="brand"
              label="Pages"
              value={totalPages}
              icon={<FileText size={16} aria-hidden />}
            />
            <KpiTile
              tone="success"
              label="Cheques"
              value={totalChecks}
              icon={<ImageIcon size={16} aria-hidden />}
            />
            <KpiTile
              label="File Size"
              value={fmtSize(analyzeResult.file_size)}
              icon={<HardDrive size={16} aria-hidden />}
            />
            <KpiTile
              tone="warning"
              label="Format"
              value={analyzeResult.doc_format}
              icon={<Settings2 size={16} aria-hidden />}
            />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-sm font-semibold text-ink-strong">Page Previews</h2>
            <div className="glass-track inline-flex items-center gap-0.5 rounded-pill p-1">
              <button
                onClick={() => setViewMode('card')}
                aria-pressed={viewMode === 'card'}
                className={cn(
                  'press inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium',
                  viewMode === 'card'
                    ? 'glass-card font-semibold text-brand-deep'
                    : 'text-ink-body hover:text-ink-strong'
                )}
              >
                <LayoutGrid size={12} aria-hidden /> Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
                className={cn(
                  'press inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium',
                  viewMode === 'table'
                    ? 'glass-card font-semibold text-brand-deep'
                    : 'text-ink-body hover:text-ink-strong'
                )}
              >
                <List size={12} aria-hidden /> Table
              </button>
            </div>
          </div>

          {/* ── Card View ─────────────────────────────── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {pages.map((page) => (
                <GlassCard
                  key={page.page_number}
                  padding="none"
                  interactive
                  onClick={() => setSelectedPage(page.page_number)}
                  className="group overflow-hidden"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-surface-sunken">
                    <img
                      src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                      alt={`Page ${page.page_number}`}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    {/* `hidden` is removed by the onError handler above; `flex`
                        then takes over, which is why both are present. */}
                    <div className="absolute inset-0 hidden flex items-center justify-center text-ink-faint">
                      <FileText size={36} aria-hidden />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-quick ease-settle group-hover:bg-ink-strong/5 group-hover:opacity-100">
                      <span className="glass-card rounded-full p-1.5">
                        <Eye size={14} className="text-ink-strong" aria-hidden />
                      </span>
                    </div>
                    <span className="nums absolute left-1.5 top-1.5 rounded-input bg-ink-strong/55 px-1.5 py-0.5 text-[10px] font-medium text-ink-invert">
                      {page.page_number}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink-strong">Page {page.page_number}</span>
                      {page.checks_on_page > 0 && (
                        <Badge tone="success" size="sm" className="nums">
                          {page.checks_on_page} cheque{page.checks_on_page > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    {page.width > 0 && (
                      <p className="nums mt-0.5 text-xs text-ink-faint">
                        {page.width} x {page.height}px
                      </p>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          {/* ── Table View ────────────────────────────── */}
          {viewMode === 'table' && (
            <TableShell>
              <TableScroll className="max-h-[70vh]">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Preview</Th>
                      <Th>Page</Th>
                      <Th numeric>Cheques</Th>
                      <Th numeric>Dimensions</Th>
                      <Th className="text-center">View</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {pages.map((page) => (
                      <Tr
                        key={page.page_number}
                        interactive
                        onClick={() => setSelectedPage(page.page_number)}
                      >
                        <Td>
                          <div className="h-16 w-12 overflow-hidden rounded-input bg-surface-sunken">
                            <img
                              src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                              alt={`Page ${page.page_number}`}
                              className="h-full w-full object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        </Td>
                        <Td className="font-medium">Page {page.page_number}</Td>
                        <Td numeric>
                          {page.checks_on_page > 0 ? (
                            <Badge tone="success" size="sm" className="nums">
                              {page.checks_on_page}
                            </Badge>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </Td>
                        <Td numeric muted className="font-mono text-xs">
                          {page.width > 0 ? `${page.width} x ${page.height}` : '—'}
                        </Td>
                        <Td className="text-center">
                          <IconButton aria-label={`View page ${page.page_number}`} size="icon-sm">
                            <Eye size={14} />
                          </IconButton>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableScroll>
            </TableShell>
          )}

          {/* ── Detected Cheques Preview ──────────────── */}
          {analyzeResult.checks.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-sm font-semibold text-ink-strong">
                Detected Cheques ({analyzeResult.checks.length})
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {analyzeResult.checks.map((check, idx) => (
                  <GlassCard
                    key={check.check_id}
                    padding="none"
                    interactive
                    onClick={() => { setSelectedCheck(check.check_id); setZoom(1); }}
                    className="group overflow-hidden"
                  >
                    <div className="relative aspect-[2/1] overflow-hidden bg-surface-sunken">
                      <img
                        src={`/api/check-image/${analyzeResult.job_id}/${check.check_id}`}
                        alt={`Cheque ${check.check_id}`}
                        className="h-full w-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-quick ease-settle group-hover:bg-ink-strong/5 group-hover:opacity-100">
                        <span className="glass-card rounded-full p-1.5">
                          <Eye size={14} className="text-ink-strong" aria-hidden />
                        </span>
                      </div>
                      <span className="nums absolute left-1.5 top-1.5 rounded-input bg-ink-strong/55 px-1.5 py-0.5 text-[10px] font-medium text-ink-invert">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5">
                      <span className="nums text-xs font-medium text-ink-strong">Cheque #{idx + 1}</span>
                      <span className="nums text-xs text-ink-faint">Page {check.page}</span>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}


          {/* ── Full-size page image modal ──────────────── */}
          {selectedPage !== null && (() => {
            const pg = pages.find((p) => p.page_number === selectedPage);
            return (
              <Dialog
                open
                size="full"
                title={`Page ${selectedPage} of ${totalPages}`}
                onClose={() => { setSelectedPage(null); setZoom(1); }}
                footer={
                  pg ? (
                    <div className="flex flex-1 items-center justify-between text-xs text-ink-body">
                      <span>
                        {pg.checks_on_page > 0
                          ? `${pg.checks_on_page} cheque${pg.checks_on_page > 1 ? 's' : ''} detected`
                          : 'No cheques detected'}
                      </span>
                      {pg.width > 0 && (
                        <span className="nums font-mono text-ink-faint">
                          {pg.width} x {pg.height}px
                        </span>
                      )}
                    </div>
                  ) : undefined
                }
              >
                <ViewerToolbar
                  zoom={zoom}
                  onZoom={setZoom}
                  onPrev={() => setSelectedPage(Math.max(1, selectedPage - 1))}
                  onNext={() => setSelectedPage(Math.min(totalPages, selectedPage + 1))}
                  canPrev={selectedPage > 1}
                  canNext={selectedPage < totalPages}
                />
                <div className="scroll-region mt-3 flex max-h-[68vh] items-center justify-center rounded-card bg-surface-sunken p-4">
                  <img
                    src={`/api/page-image/${analyzeResult.job_id}/${selectedPage}`}
                    alt={`Page ${selectedPage}`}
                    className="rounded-input shadow-glass transition-transform duration-settle ease-settle"
                    /* Zoom is a runtime number, so the transform stays inline.
                       Radius, shadow and easing are tokens. */
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', maxWidth: '100%', maxHeight: '60vh' }}
                  />
                </div>
              </Dialog>
            );
          })()}

          {/* ── Cheque detail dialog ────────────────────── */}
          {selectedCheck !== null && (() => {
            const chks = analyzeResult.checks;
            const idx = chks.findIndex((c) => c.check_id === selectedCheck);
            const check = chks[idx];
            if (!check) return null;
            return (
              <Dialog
                open
                size="full"
                title={`Cheque #${idx + 1} of ${chks.length}`}
                onClose={() => { setSelectedCheck(null); setZoom(1); }}
                footer={
                  <div className="flex flex-1 items-center justify-between text-xs text-ink-body">
                    <span className="nums">Page {check.page}</span>
                    <span className="nums font-mono text-ink-faint">
                      {check.width} x {check.height}px
                    </span>
                  </div>
                }
              >
                <ViewerToolbar
                  zoom={zoom}
                  onZoom={setZoom}
                  onPrev={() => { if (idx > 0) { setSelectedCheck(chks[idx - 1].check_id); setZoom(1); } }}
                  onNext={() => { if (idx < chks.length - 1) { setSelectedCheck(chks[idx + 1].check_id); setZoom(1); } }}
                  canPrev={idx > 0}
                  canNext={idx < chks.length - 1}
                />
                <div className="scroll-region mt-3 flex max-h-[68vh] items-center justify-center rounded-card bg-surface-sunken p-4">
                  <img
                    src={`/api/check-image/${analyzeResult.job_id}/${check.check_id}`}
                    alt={`Cheque ${check.check_id}`}
                    className="rounded-input shadow-glass transition-transform duration-settle ease-settle"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', maxWidth: '100%', maxHeight: '58vh' }}
                  />
                </div>
              </Dialog>
            );
          })()}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 3: CONFIGURE & EXTRACT
         ══════════════════════════════════════════════════ */}
      {(step === 'configure' || step === 'starting') && analyzeResult && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-2xl font-semibold text-ink-strong">Configure Extraction</h1>
              <p className="nums mt-0.5 truncate text-sm text-ink-body">
                {analyzeResult.pdf_name} — {totalPages} pages, {totalChecks} cheques
              </p>
            </div>
            <Button
              size="sm"
              variant="link"
              onClick={() => setStep('preview')}
              icon={<ChevronLeft size={12} />}
            >
              Back to Preview
            </Button>
          </div>

          {/* ── Multi-job tabs ──────────────────────────── */}
          {jobEntries.length > 1 && (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{jobStrip}</div>
              {jobEntries.filter((j) => j.status === 'analyzed').length > 1 && (
                <Button
                  size="sm"
                  onClick={handleExtractAll}
                  icon={<Play size={12} />}
                  className="shrink-0"
                >
                  Extract All ({jobEntries.filter((j) => j.status === 'analyzed').length})
                </Button>
              )}
            </div>
          )}

          {/* ── Range Selection ──────────────────── */}
          <GlassCard padding="sm">
            <div className="mb-2.5 flex items-center gap-2">
              <FileText size={14} className="text-ink-faint" aria-hidden />
              <GlassCardTitle className="text-sm">Range</GlassCardTitle>
            </div>
            <div role="radiogroup" aria-label="Extraction range" className="space-y-1.5">
              {([
                { key: 'all', title: 'All pages', hint: `${totalPages} pages, ${totalChecks} cheques` },
                {
                  key: 'pages',
                  title: 'Choose pages',
                  hint: 'Tick the pages to extract — cheque pages are pre-ticked',
                },
                ...(totalChecks > 0
                  ? [{ key: 'cheques', title: 'Cheque Range', hint: 'Select specific cheques' }]
                  : []),
              ] as { key: RangeType; title: string; hint: string }[]).map((opt) => (
                <div key={opt.key}>
                  <button
                    role="radio"
                    aria-checked={rangeType === opt.key}
                    onClick={() => setRangeType(opt.key)}
                    disabled={step === 'starting'}
                    className={cn(
                      'press glass-panel w-full rounded-tile p-2.5 text-left',
                      'transition-[box-shadow,border-color,background-color] duration-quick ease-settle',
                      'disabled:pointer-events-none disabled:opacity-disabled',
                      rangeType === opt.key && 'glass-selected'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-ink-strong">{opt.title}</p>
                        <p className="nums text-[10px] text-ink-faint">{opt.hint}</p>
                      </div>
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                          rangeType === opt.key ? 'border-brand bg-brand' : 'border-ink-faint/50'
                        )}
                      >
                        {rangeType === opt.key && <CheckCircle size={8} className="text-ink-invert" />}
                      </span>
                    </div>
                  </button>

                  {opt.key === 'pages' && rangeType === 'pages' && (
                    <div className="space-y-2 pl-3 pt-1.5">
                      <PageSelectGrid
                        pages={pages}
                        selected={selectedPages}
                        onChange={setSelectedPages}
                        disabled={step === 'starting'}
                      />
                      {selectedPages.size === 0 && (
                        <p className="text-[10px] text-warning-text">
                          Select at least one page, or choose All pages.
                        </p>
                      )}
                    </div>
                  )}

                  {opt.key === 'cheques' && rangeType === 'cheques' && (
                    <div className="flex items-end gap-2 pl-3 pt-1.5">
                      <label className="block">
                        <span className="block text-[10px] text-ink-faint">From</span>
                        <Input
                          type="number"
                          inputSize="sm"
                          min={1}
                          max={totalChecks}
                          value={chequeFrom}
                          onChange={(e) => setChequeFrom(Math.max(1, Math.min(totalChecks, parseInt(e.target.value) || 1)))}
                          disabled={step === 'starting'}
                          className="nums w-16"
                        />
                      </label>
                      <span className="pb-2 text-xs text-ink-faint">to</span>
                      <label className="block">
                        <span className="block text-[10px] text-ink-faint">To</span>
                        <Input
                          type="number"
                          inputSize="sm"
                          min={chequeFrom}
                          max={totalChecks}
                          value={chequeTo}
                          onChange={(e) => setChequeTo(Math.max(chequeFrom, Math.min(totalChecks, parseInt(e.target.value) || 1)))}
                          disabled={step === 'starting'}
                          className="nums w-16"
                        />
                      </label>
                      <span className="nums pb-2 text-[10px] text-ink-faint">of {totalChecks}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Force re-extract toggle */}
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={forceExtract}
              onChange={(e) => setForceExtract(e.target.checked)}
              disabled={step === 'starting'}
              className="h-3.5 w-3.5 rounded-sm border-glass-hairline disabled:opacity-disabled"
            />
            <span className="text-xs text-ink-body">
              Force re-run extraction
              <span className="ml-1 text-ink-faint">— run again even if results already exist</span>
            </span>
          </label>

          {/* Start extraction button */}
          <div className="flex justify-end">
            <Button
              onClick={() => handleStartExtraction()}
              disabled={rangeType === 'pages' && selectedPages.size === 0}
              loading={step === 'starting'}
              icon={<Play size={14} />}
            >
              {step === 'starting' ? 'Starting Extraction…' : 'Start Extraction'}
            </Button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════
          Re-upload confirmation. Replaces window.confirm, same behaviour:
          decline skips the file, accept retries with ?confirm_reupload=true.
         ══════════════════════════════════════════════════ */}
      <Dialog
        open={!!reuploadAsk}
        size="md"
        title="You uploaded this file before"
        onClose={() => answerReupload(false)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => answerReupload(false)}>
              Skip this file
            </Button>
            <Button size="sm" onClick={() => answerReupload(true)}>
              Process it again
            </Button>
          </>
        }
      >
        {reuploadAsk && (
          <div className="space-y-3">
            <GlassPanel radius="input" padding="sm" className="flex items-center gap-2.5">
              <FileText size={16} className="shrink-0 text-ink-faint" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">
                {reuploadAsk.fileName}
              </span>
            </GlassPanel>
            <p className="text-sm text-ink-body">
              {reuploadAsk.previousUploadedAt
                ? `This document was already uploaded on ${new Date(
                    reuploadAsk.previousUploadedAt
                  ).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}.`
                : 'This document has already been uploaded.'}
            </p>
            <p className="text-sm text-ink-body">
              Processing it again will re-read every cheque, and{' '}
              <strong className="font-semibold text-ink-strong">
                those cheques count against this month&apos;s total
              </strong>
              . Skip it to leave your existing results untouched.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
