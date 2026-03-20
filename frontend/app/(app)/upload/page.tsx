'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DropzoneUpload from './components/DropzoneUpload';
import {
  Upload, FileText, Image as ImageIcon, Loader2, CheckCircle,
  ChevronRight, ChevronLeft, Eye, LayoutGrid, List, ZoomIn, ZoomOut,
  Settings2, Play, X, AlertCircle, HardDrive,
} from 'lucide-react';

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

function fmtSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Extraction methods available ───────────────────────────
const EXTRACTION_METHODS = [
  { id: 'tesseract', name: 'Tesseract OCR', desc: 'Fast offline text recognition via Tesseract', icon: '🔍' },
  { id: 'numarkdown', name: 'NuMarkdown', desc: 'Vision-language model — good for structured layouts', icon: '📝' },
  { id: 'ai', name: 'Gemini AI', desc: 'Google Gemini 2.0 Flash — best for handwritten fields', icon: '🤖' },
  { id: 'hybrid', name: 'All (Hybrid)', desc: 'Run all 3 engines and merge results for best accuracy', icon: '⚡' },
];

const STEP_ORDER: ('upload' | 'preview' | 'configure')[] = ['upload', 'preview', 'configure'];
const STEP_LABELS: Record<string, string> = { upload: 'Upload', preview: 'Preview', configure: 'Configure & Extract' };

export default function UploadPage() {
  const router = useRouter();

  // ── Step state ───────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessages, setProgressMessages] = useState<Record<string, string[]>>({});

  // ── Multi-job state ────────────────────────────────────────
  const [jobEntries, setJobEntries] = useState<JobEntry[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // ── Preview state ────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // ── Extraction config ────────────────────────────────────
  const [selectedMethods, setSelectedMethods] = useState<string[]>(['ai']);
  const [rangeType, setRangeType] = useState<RangeType>('all');
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);
  const [chequeFrom, setChequeFrom] = useState(1);
  const [chequeTo, setChequeTo] = useState(1);
  const [forceExtract, setForceExtract] = useState(false);

  // ── Derived from active job ────────────────────────────────
  const activeJob = jobEntries.find((j) => j.id === activeJobId);
  const analyzeResult = activeJob?.result || null;
  const pages = analyzeResult?.pages || [];
  const totalPages = analyzeResult?.total_pages || 0;
  const totalChecks = analyzeResult?.total_checks || 0;

  // ── Helpers ────────────────────────────────────────────────
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
            messages.push('📄 Uploading PDF...');
          } else if (jobData.status === 'analyzing') {
            messages.push('🔍 Converting PDF to images...');
          } else if (jobData.status === 'detecting') {
            messages.push('🔎 Detecting checks on pages...');
          } else if (jobData.status === 'extracting') {
            messages.push('✂️ Extracting check images...');
          } else if (jobData.status === 'ocr_running') {
            messages.push('🤖 Running OCR extraction...');
          } else if (jobData.status === 'analyzed') {
            messages.push('✅ Analysis complete');
          } else if (jobData.status === 'complete') {
            messages.push('✅ Extraction complete');
          }
          
          // Show page conversion progress
          if (jobData.total_pages > 0) {
            messages.push(`📑 ${jobData.total_pages} pages converted`);
            if (jobData.doc_format) {
              messages.push(`📐 Format: ${jobData.doc_format}`);
            }
          }
          
          // Show check detection progress
          if (jobData.total_checks > 0) {
            messages.push(`✓ ${jobData.total_checks} checks detected`);
          }
          
          // Show per-page detection if available
          if (jobData.pages && Array.isArray(jobData.pages) && jobData.pages.length > 0) {
            const pagesWithChecks = jobData.pages.filter((p: any) => p.checks_on_page > 0);
            if (pagesWithChecks.length > 0 && pagesWithChecks.length <= 5) {
              // Show first few pages with check counts
              pagesWithChecks.slice(0, 5).forEach((p: any) => {
                messages.push(`Page ${p.page_number}: ${p.checks_on_page} checks`);
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
      const response = await fetch(`${backendUrl}/api/upload-analyze`, {
        method: 'POST',
        body: formData,
      });
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
    } catch {
      setProgressMessages(prev => ({ ...prev, [entryId]: ['Converting PDF to images...'] }));
      
      const formData2 = new FormData();
      formData2.append('file', file);
      const response = await fetch(`${backendUrl}/api/upload-pdf`, {
        method: 'POST',
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
      console.log(`⏳ Waiting for Phase 1 completion for job ${jobId}...`);
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
              console.log(`✅ Phase 1 complete: ${jobData.total_pages} pages, ${jobData.total_checks} checks`);
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
        console.warn('⚠️ Timeout waiting for Phase 1 completion');
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

    // If duplicate and status is 'analyzed', auto-extract it
    if (isDuplicate && data.status === 'analyzed') {
      console.log(`🔄 Duplicate detected (${result.job_id}), auto-extracting...`);
      setTimeout(() => {
        handleStartExtraction(result.job_id);
      }, 1000);
    }

    return result;
  }, []);

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
    
    // Check for large files and warn user
    const largeFiles = files.filter(f => f.size > 5 * 1024 * 1024); // > 5MB
    if (largeFiles.length > 0) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const sizeInMB = (totalSize / (1024 * 1024)).toFixed(1);
      console.log(`📦 Processing ${files.length} file(s) (${sizeInMB} MB total)`);
      console.log('⏱️ Large files detected - this may take 1-2 minutes');
    }
    
    setUploading(true);
    setError(null);

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

    if (firstSuccess) {
      setActiveJobId(firstSuccess.value.job_id);
      setPageTo(firstSuccess.value.total_pages);
      setChequeTo(firstSuccess.value.total_checks || 1);
      setStep('preview');
      
      // Auto-extract all uploaded jobs so they appear in QB Comparisons
      setTimeout(() => {
        handleExtractAll();
      }, 500);
    } else {
      setError('All uploads failed. Please try again.');
    }

    setUploading(false);
  };

  const handleSelectJob = (jobId: string) => {
    setActiveJobId(jobId);
    const job = jobEntries.find((j) => j.id === jobId);
    if (job?.result) {
      setPageTo(job.result.total_pages);
      setChequeTo(job.result.total_checks || 1);
      setPageFrom(1);
      setChequeFrom(1);
      setRangeType('all');
      setSelectedPage(null);
      setSelectedCheck(null);
    }
  };

  const toggleMethod = (methodId: string) => {
    setSelectedMethods((prev) => {
      if (methodId === 'hybrid') return ['hybrid'];
      const without = prev.filter((m) => m !== 'hybrid' && m !== methodId);
      if (prev.includes(methodId)) {
        return without.length === 0 ? ['hybrid'] : without;
      }
      return [...without, methodId];
    });
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
      const isReExtract = forceExtract;
      const methodsToRun = isReExtract ? ['ai'] : selectedMethods;

      if (isReExtract) {
        const wantsAllMethods = window.confirm('Use all extraction methods for this re-run? Click OK for the full extraction suite or Cancel to continue with the recommended fast re-run.');
        if (wantsAllMethods) {
          window.alert('This re-run currently uses the recommended fast extraction path to avoid reprocessing every engine. Continuing with the fast re-run.');
        }
      }

      const body: Record<string, unknown> = {
        job_id: jobId,
        methods: methodsToRun,
        force: forceExtract,
      };
      if (rangeType === 'pages') {
        body.page_range = { from: pageFrom, to: pageTo };
      } else if (rangeType === 'cheques') {
        body.cheque_range = { from: chequeFrom, to: chequeTo };
      } else {
        body.page_range = { from: 1, to: r.total_pages };
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

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-5 space-y-5">
      {/* ── Step indicator ──────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => {
          const isCurrent = i === currentStepIdx;
          const isDone = i < currentStepIdx;
          return (
            <div key={s} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                isCurrent ? 'bg-gray-900 text-white' :
                isDone ? 'bg-emerald-100 text-emerald-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                {isDone ? <CheckCircle size={12} /> : <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-current flex items-center justify-center text-[9px] font-bold">{i + 1}</span>}
                {STEP_LABELS[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Error banner ────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-lg flex items-center gap-2 text-[13px]">
          <AlertCircle size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-0.5 hover:bg-red-100 rounded"><X size={14} /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 1: UPLOAD
         ══════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Upload Document</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Upload a PDF. We&apos;ll detect pages and cheques before extraction.
            </p>
          </div>

          <DropzoneUpload onFilesSelected={handleFilesSelected} />

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <h3 className="text-[13px] font-semibold text-gray-900">Files ({files.length})</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {files.map((file, index) => (
                    <div key={index} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/50 transition">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-gray-100 rounded">
                          <FileText className="text-gray-500" size={14} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-[13px]">{file.name}</p>
                          <p className="text-[11px] text-gray-400">{fmtSize(file.size)}</p>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveFile(index)} className="p-1 text-gray-300 hover:text-red-500 transition">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress Display During Upload */}
              {uploading && jobEntries.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <Loader2 className="text-blue-600 flex-shrink-0 mt-0.5 animate-spin" size={20} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-blue-900">Processing Documents...</h3>
                        {(() => {
                          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
                          const largeFile = totalSize > 5 * 1024 * 1024;
                          if (largeFile) {
                            return (
                              <span className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                                ⏱️ Large file - may take 1-2 minutes
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="space-y-2">
                        {jobEntries.map((entry) => {
                          const messages = progressMessages[entry.id] || [];
                          return (
                            <div key={entry.id} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-blue-800 font-medium truncate max-w-[300px]">
                                  {entry.file.name}
                                </span>
                                <div className="flex items-center gap-3 ml-4">
                                  {entry.status === 'uploading' && (
                                    <span className="text-blue-600 flex items-center gap-1">
                                      <Loader2 size={12} className="animate-spin" />
                                      {messages.length > 0 ? messages[messages.length - 1] : 'Analyzing...'}
                                    </span>
                                  )}
                                  {entry.status === 'analyzed' && entry.result && (
                                    <span className="text-emerald-700 font-semibold flex items-center gap-2">
                                      <CheckCircle size={12} />
                                      {entry.result.total_pages} pages, {entry.result.total_checks} checks found
                                    </span>
                                  )}
                                  {entry.status === 'error' && (
                                    <span className="text-red-600 flex items-center gap-1">
                                      <AlertCircle size={12} />
                                      {entry.error || 'Failed'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Show all progress messages */}
                              {entry.status === 'uploading' && messages.length > 0 && (
                                <div className="ml-4 space-y-0.5">
                                  {messages.map((msg, idx) => (
                                    <div key={idx} className="text-[11px] text-blue-600 flex items-center gap-1">
                                      <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
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
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <p className="text-xs text-blue-700 flex items-start gap-2">
                          <span className="text-blue-500 mt-0.5">💡</span>
                          <span>
                            <strong>Tip:</strong> Processing time varies by file size. 
                            {(() => {
                              const analyzing = jobEntries.filter(e => e.status === 'uploading').length;
                              const completed = jobEntries.filter(e => e.status === 'analyzed').length;
                              if (analyzing > 0 && completed > 0) {
                                return ` ${completed} of ${jobEntries.length} completed.`;
                              }
                              return ' You can continue working while we process in the background.';
                            })()}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFiles([])}
                  className="px-3.5 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-[13px] text-gray-600 transition"
                  disabled={uploading}
                >
                  Clear
                </button>
                <button
                  onClick={handleUploadAndAnalyze}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-[13px] font-medium transition shadow-sm"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Analyzing {files.length} file{files.length > 1 ? 's' : ''}...
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      Upload &amp; Analyze
                    </>
                  )}
                </button>
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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Document Preview</h1>
              <p className="text-[13px] text-gray-500 mt-0.5">{analyzeResult.pdf_name}</p>
            </div>
            <button
              onClick={() => setStep('upload')}
              className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition"
            >
              <ChevronLeft size={12} /> Back
            </button>
          </div>

          {/* ── Multi-job tabs ──────────────────────────── */}
          {jobEntries.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {jobEntries.map((entry) => {
                const isActive = entry.id === activeJobId;
                const statusColors: Record<JobStatus, string> = {
                  uploading: 'bg-blue-400',
                  analyzed: 'bg-emerald-400',
                  extracting: 'bg-amber-400 animate-pulse',
                  complete: 'bg-emerald-500',
                  error: 'bg-red-400',
                };
                return (
                  <button
                    key={entry.id}
                    onClick={() => handleSelectJob(entry.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition border ${
                      isActive
                        ? 'border-gray-900 bg-gray-50 text-gray-900'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusColors[entry.status]}`} />
                    {entry.result?.pdf_name || entry.file.name}
                    {entry.result && (
                      <span className="text-[10px] text-gray-400">
                        {entry.result.total_checks} chq
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Action Buttons (Top) ──────────────────── */}
          <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStep('upload');
                  setActiveJobId(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-[13px] text-gray-600 transition"
              >
                <ChevronLeft size={14} />
                Back to Upload
              </button>
              <button
                onClick={() => {
                  router.push('/dashboard');
                }}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-[13px] text-gray-600 transition"
              >
                <X size={14} />
                Extract Later
              </button>
            </div>
            <button
              onClick={() => setStep('configure')}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-[13px] font-medium transition shadow-sm"
            >
              Continue to Configure
              <ChevronRight size={14} />
            </button>
          </div>

          {/* ── Duplicate Warning Banner ──────────────── */}
          {analyzeResult.isDuplicate && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">Duplicate Document Detected</h3>
                <p className="text-sm text-amber-700">
                  This file has already been uploaded. Using existing job <span className="font-mono font-medium">{analyzeResult.job_id}</span>.
                  {' '}Auto-extracting checks in the background...
                </p>
              </div>
            </div>
          )}

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText className="text-blue-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Pages</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{totalPages}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ImageIcon className="text-emerald-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Cheques</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{totalChecks}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <HardDrive className="text-purple-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">File Size</p>
                <p className="text-xl font-semibold text-gray-900 -mt-0.5">{fmtSize(analyzeResult.file_size)}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Settings2 className="text-amber-600" size={16} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Format</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{analyzeResult.doc_format}</p>
              </div>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Page Previews</h2>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  viewMode === 'card' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid size={12} /> Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List size={12} /> Table
              </button>
            </div>
          </div>

          {/* ── Card View ─────────────────────────────── */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {pages.map((page) => (
                <div
                  key={page.page_number}
                  onClick={() => setSelectedPage(page.page_number)}
                  className="bg-white rounded-xl border border-gray-100 hover:border-blue-300 hover:shadow-md transition cursor-pointer overflow-hidden group"
                >
                  <div className="aspect-[3/4] bg-gray-50 relative overflow-hidden">
                    <img
                      src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                      alt={`Page ${page.page_number}`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden absolute inset-0 flex items-center justify-center text-gray-300">
                      <FileText size={36} />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="bg-white/90 rounded-full p-1.5 shadow">
                        <Eye size={14} className="text-gray-700" />
                      </div>
                    </div>
                    <div className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                      {page.page_number}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[12px] text-gray-900">Page {page.page_number}</span>
                      {page.checks_on_page > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                          {page.checks_on_page} cheque{page.checks_on_page > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {page.width > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{page.width} x {page.height}px</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Table View ────────────────────────────── */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Preview</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Page</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Cheques</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider">Dimensions</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pages.map((page) => (
                    <tr
                      key={page.page_number}
                      className="hover:bg-blue-50/30 cursor-pointer transition"
                      onClick={() => setSelectedPage(page.page_number)}
                    >
                      <td className="px-3 py-2">
                        <div className="w-12 h-16 bg-gray-100 rounded overflow-hidden">
                          <img
                            src={`/api/page-image/${analyzeResult.job_id}/${page.page_number}`}
                            alt={`Page ${page.page_number}`}
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">Page {page.page_number}</td>
                      <td className="px-3 py-2">
                        {page.checks_on_page > 0 ? (
                          <span className="text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                            {page.checks_on_page}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-[12px] font-mono">
                        {page.width > 0 ? `${page.width} x ${page.height}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button className="text-blue-500 hover:text-blue-700">
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detected Cheques Preview ──────────────── */}
          {analyzeResult.checks.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-900">Detected Cheques ({analyzeResult.checks.length})</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {analyzeResult.checks.map((check, idx) => (
                  <div
                    key={check.check_id}
                    onClick={() => { setSelectedCheck(check.check_id); setZoom(1); }}
                    className="bg-white rounded-xl border border-gray-100 hover:border-emerald-300 hover:shadow-md transition cursor-pointer overflow-hidden group"
                  >
                    <div className="aspect-[2/1] bg-gray-50 relative overflow-hidden">
                      <img
                        src={`/api/check-image/${analyzeResult.job_id}/${check.check_id}`}
                        alt={`Cheque ${check.check_id}`}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 rounded-full p-1.5 shadow">
                          <Eye size={14} className="text-gray-700" />
                        </div>
                      </div>
                      <div className="absolute top-1.5 left-1.5 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                        #{idx + 1}
                      </div>
                    </div>
                    <div className="p-2.5 flex items-center justify-between">
                      <span className="text-[12px] font-medium text-gray-900">Cheque #{idx + 1}</span>
                      <span className="text-[11px] text-gray-400">Page {check.page}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ── Full-size page image modal ──────────────── */}
          {selectedPage !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedPage(null)}>
              <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b">
                  <h3 className="text-sm font-semibold text-gray-900">Page {selectedPage} of {totalPages}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom <= 0.25}><ZoomOut size={14} /></button>
                    <span className="text-[11px] font-medium text-gray-500 min-w-[2.5rem] text-center">{(zoom * 100).toFixed(0)}%</span>
                    <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom >= 3}><ZoomIn size={14} /></button>
                    <div className="w-px h-4 bg-gray-200 mx-1" />
                    <button onClick={() => setSelectedPage(Math.max(1, selectedPage - 1))} disabled={selectedPage <= 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                    <button onClick={() => setSelectedPage(Math.min(totalPages, selectedPage + 1))} disabled={selectedPage >= totalPages} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
                    <button onClick={() => { setSelectedPage(null); setZoom(1); }} className="p-1.5 hover:bg-gray-100 rounded ml-1"><X size={14} /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-gray-50 flex items-center justify-center">
                  <img src={`/api/page-image/${analyzeResult.job_id}/${selectedPage}`} alt={`Page ${selectedPage}`}
                    className="shadow-lg rounded transition-transform" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', maxWidth: '100%', maxHeight: '75vh' }} />
                </div>
                {(() => {
                  const pg = pages.find((p) => p.page_number === selectedPage);
                  return pg ? (
                    <div className="px-5 py-2.5 border-t bg-white flex items-center justify-between text-[12px] text-gray-500">
                      <span>{pg.checks_on_page > 0 ? `${pg.checks_on_page} cheque${pg.checks_on_page > 1 ? 's' : ''} detected` : 'No cheques detected'}</span>
                      {pg.width > 0 && <span className="font-mono text-gray-400">{pg.width} x {pg.height}px</span>}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          )}

          {/* ── Cheque detail dialog ────────────────────── */}
          {selectedCheck !== null && analyzeResult && (() => {
            const chks = analyzeResult.checks;
            const idx = chks.findIndex((c) => c.check_id === selectedCheck);
            const check = chks[idx];
            if (!check) return null;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedCheck(null)}>
                <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 py-3 border-b">
                    <h3 className="text-sm font-semibold text-gray-900">Cheque #{idx + 1} of {chks.length}</h3>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setZoom(Math.max(0.25, zoom - 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom <= 0.25}><ZoomOut size={14} /></button>
                      <span className="text-[11px] font-medium text-gray-500 min-w-[2.5rem] text-center">{(zoom * 100).toFixed(0)}%</span>
                      <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="p-1.5 hover:bg-gray-100 rounded" disabled={zoom >= 3}><ZoomIn size={14} /></button>
                      <div className="w-px h-4 bg-gray-200 mx-1" />
                      <button onClick={() => { if (idx > 0) { setSelectedCheck(chks[idx - 1].check_id); setZoom(1); } }} disabled={idx <= 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <button onClick={() => { if (idx < chks.length - 1) { setSelectedCheck(chks[idx + 1].check_id); setZoom(1); } }} disabled={idx >= chks.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
                      <button onClick={() => { setSelectedCheck(null); setZoom(1); }} className="p-1.5 hover:bg-gray-100 rounded ml-1"><X size={14} /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-4 bg-gray-50 flex items-center justify-center">
                    <img src={`/api/check-image/${analyzeResult.job_id}/${check.check_id}`} alt={`Cheque ${check.check_id}`}
                      className="shadow-lg rounded transition-transform" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', maxWidth: '100%', maxHeight: '70vh' }} />
                  </div>
                  <div className="px-5 py-2.5 border-t bg-white flex items-center justify-between text-[12px] text-gray-500">
                    <span>Page {check.page}</span>
                    <span className="font-mono text-gray-400">{check.width} x {check.height}px</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 3: CONFIGURE & EXTRACT
         ══════════════════════════════════════════════════ */}
      {(step === 'configure' || step === 'starting') && analyzeResult && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Configure Extraction</h1>
              <p className="text-[13px] text-gray-500 mt-0.5">{analyzeResult.pdf_name} — {totalPages} pages, {totalChecks} cheques</p>
            </div>
            <button
              onClick={() => setStep('preview')}
              className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition"
            >
              <ChevronLeft size={12} /> Back to Preview
            </button>
          </div>

          {/* ── Multi-job tabs ──────────────────────────── */}
          {jobEntries.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {jobEntries.map((entry) => {
                const isActive = entry.id === activeJobId;
                const statusColors: Record<JobStatus, string> = {
                  uploading: 'bg-blue-400',
                  analyzed: 'bg-emerald-400',
                  extracting: 'bg-amber-400 animate-pulse',
                  complete: 'bg-emerald-500',
                  error: 'bg-red-400',
                };
                return (
                  <button
                    key={entry.id}
                    onClick={() => handleSelectJob(entry.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition border ${
                      isActive
                        ? 'border-gray-900 bg-gray-50 text-gray-900'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusColors[entry.status]}`} />
                    {entry.result?.pdf_name || entry.file.name}
                  </button>
                );
              })}
              {jobEntries.filter((j) => j.status === 'analyzed').length > 1 && (
                <button
                  onClick={handleExtractAll}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-gray-900 text-white hover:bg-gray-800 transition ml-auto"
                >
                  <Play size={12} />
                  Extract All ({jobEntries.filter((j) => j.status === 'analyzed').length})
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Method Selection ──────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Settings2 size={14} className="text-gray-500" />
                <h3 className="text-[13px] font-semibold text-gray-900">Extraction Method</h3>
              </div>
              <div className="space-y-1.5">
                {EXTRACTION_METHODS.map((method) => {
                  const isSelected = selectedMethods.includes(method.id);
                  return (
                    <button
                      key={method.id}
                      onClick={() => toggleMethod(method.id)}
                      disabled={step === 'starting'}
                      className={`w-full text-left p-2.5 rounded-lg border transition ${
                        isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{method.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[12px] text-gray-900">{method.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{method.desc}</p>
                        </div>
                        <div className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center transition flex-shrink-0 ${
                          isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckCircle size={8} className="text-white" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Range Selection ──────────────────── */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <FileText size={14} className="text-gray-500" />
                <h3 className="text-[13px] font-semibold text-gray-900">Range</h3>
              </div>
              <div className="space-y-1.5">
                <button
                  onClick={() => setRangeType('all')}
                  disabled={step === 'starting'}
                  className={`w-full text-left p-2.5 rounded-lg border transition ${
                    rangeType === 'all' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[12px] text-gray-900">All</p>
                      <p className="text-[10px] text-gray-400">{totalPages} pages, {totalChecks} cheques</p>
                    </div>
                    <div className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center ${
                      rangeType === 'all' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                      {rangeType === 'all' && <CheckCircle size={8} className="text-white" />}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setRangeType('pages')}
                  disabled={step === 'starting'}
                  className={`w-full text-left p-2.5 rounded-lg border transition ${
                    rangeType === 'pages' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[12px] text-gray-900">Page Range</p>
                      <p className="text-[10px] text-gray-400">Select specific pages</p>
                    </div>
                    <div className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center ${
                      rangeType === 'pages' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                      {rangeType === 'pages' && <CheckCircle size={8} className="text-white" />}
                    </div>
                  </div>
                </button>
                {rangeType === 'pages' && (
                  <div className="flex items-center gap-2 pl-3 pt-0.5">
                    <div>
                      <label className="text-[10px] text-gray-400 block">From</label>
                      <input type="number" min={1} max={totalPages} value={pageFrom}
                        onChange={(e) => setPageFrom(Math.max(1, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                        disabled={step === 'starting'}
                        className="w-14 px-2 py-1 border rounded text-[12px] disabled:opacity-50" />
                    </div>
                    <span className="text-gray-400 mt-3 text-[11px]">to</span>
                    <div>
                      <label className="text-[10px] text-gray-400 block">To</label>
                      <input type="number" min={pageFrom} max={totalPages} value={pageTo}
                        onChange={(e) => setPageTo(Math.max(pageFrom, Math.min(totalPages, parseInt(e.target.value) || 1)))}
                        disabled={step === 'starting'}
                        className="w-14 px-2 py-1 border rounded text-[12px] disabled:opacity-50" />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-3">of {totalPages}</span>
                  </div>
                )}

                {totalChecks > 0 && (
                  <>
                    <button
                      onClick={() => setRangeType('cheques')}
                      disabled={step === 'starting'}
                      className={`w-full text-left p-2.5 rounded-lg border transition ${
                        rangeType === 'cheques' ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-[12px] text-gray-900">Cheque Range</p>
                          <p className="text-[10px] text-gray-400">Select specific cheques</p>
                        </div>
                        <div className={`w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center ${
                          rangeType === 'cheques' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                        }`}>
                          {rangeType === 'cheques' && <CheckCircle size={8} className="text-white" />}
                        </div>
                      </div>
                    </button>
                    {rangeType === 'cheques' && (
                      <div className="flex items-center gap-2 pl-3 pt-0.5">
                        <div>
                          <label className="text-[10px] text-gray-400 block">From</label>
                          <input type="number" min={1} max={totalChecks} value={chequeFrom}
                            onChange={(e) => setChequeFrom(Math.max(1, Math.min(totalChecks, parseInt(e.target.value) || 1)))}
                            disabled={step === 'starting'}
                            className="w-14 px-2 py-1 border rounded text-[12px] disabled:opacity-50" />
                        </div>
                        <span className="text-gray-400 mt-3 text-[11px]">to</span>
                        <div>
                          <label className="text-[10px] text-gray-400 block">To</label>
                          <input type="number" min={chequeFrom} max={totalChecks} value={chequeTo}
                            onChange={(e) => setChequeTo(Math.max(chequeFrom, Math.min(totalChecks, parseInt(e.target.value) || 1)))}
                            disabled={step === 'starting'}
                            className="w-14 px-2 py-1 border rounded text-[12px] disabled:opacity-50" />
                        </div>
                        <span className="text-[10px] text-gray-400 mt-3">of {totalChecks}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Force re-extract toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceExtract}
              onChange={(e) => setForceExtract(e.target.checked)}
              disabled={step === 'starting'}
              className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500 disabled:opacity-50"
            />
            <span className="text-[12px] text-gray-600">
              Force re-run extraction
              <span className="text-gray-400 ml-1">— run again even if results already exist</span>
            </span>
          </label>

          {/* Start extraction button */}
          <div className="flex justify-end">
            <button
              onClick={() => handleStartExtraction()}
              disabled={step === 'starting' || selectedMethods.length === 0}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-[13px] font-medium transition shadow-sm"
            >
              {step === 'starting' ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Starting Extraction...
                </>
              ) : (
                <>
                  <Play size={14} />
                  Start Extraction
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
