'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useCheckProcessing } from '@/lib/hooks/useCheckProcessing';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CheckCircle, Loader2, FileText, Image as ImageIcon,
  Download, Eye, ChevronLeft, ChevronRight, LayoutGrid, List,
  ZoomIn, ZoomOut, RefreshCw,
} from 'lucide-react';
import {
  Badge, Button, Dialog, GlassCard, GlassCardTitle, GlassPanel, IconButton, KpiTile, StatusPill, Tabs,
  Table, TableScroll, TableShell, Tbody, Td, Th, Thead, Tr, type StatusKey,
} from '@/components/ui';
import { cn } from '@/lib/utils';

type ViewMode = 'card' | 'table';

const STAGES = [
  { name: 'upload', label: 'Upload & Validate' },
  { name: 'segmentation', label: 'Cheque Detection' },
  { name: 'extraction', label: 'Data Extraction' },
  { name: 'merging', label: 'Merge & Validate' },
  { name: 'complete', label: 'Complete' },
];

const EXPORT_FORMATS = [
  { id: 'csv', name: 'Generic CSV', desc: 'Excel, Google Sheets' },
  { id: 'iif', name: 'QuickBooks Desktop', desc: 'IIF format (CHECK transactions)' },
  { id: 'qbo', name: 'QuickBooks Online', desc: 'CSV bank transaction import' },
  { id: 'xero', name: 'Xero', desc: 'Bank statement CSV' },
  { id: 'zoho', name: 'Zoho Books', desc: 'Bank statement CSV' },
  { id: 'sage', name: 'Sage', desc: 'Accounting CSV import' },
];

/** Engine status -> the one status vocabulary, so a word is never two colours. */
const METHOD_STATUS: Record<string, StatusKey> = {
  complete: 'complete',
  running: 'processing',
  error: 'error',
};

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

/** Confidence -> state tone. One threshold table, used by both views. */
function confTone(conf: number): 'success' | 'warning' | 'error' {
  if (conf >= 0.9) return 'success';
  if (conf >= 0.7) return 'warning';
  return 'error';
}

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = params?.id ?? '';

  // Get selected methods from URL query (passed from upload page)
  const selectedMethods = useMemo(() => {
    const m = searchParams?.get('methods');
    return m ? m.split(',') : ['hybrid'];
  }, [searchParams]);

  const { currentStage, progress, isComplete, error, jobData, methodsProgress } =
    useCheckProcessing(jobId, selectedMethods);

  // Auto-redirect to review page when extraction completes
  useEffect(() => {
    if (isComplete && jobData?.checks && jobData.checks.length > 0) {
      // Brief flash of completion state, then redirect (500ms - was 2000ms)
      const timer = setTimeout(() => {
        router.push(`/review/${jobId}`);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, jobData?.checks, jobId, router]);

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const stageIndex = STAGES.findIndex((s) => s.name === currentStage);
  const checks = jobData?.checks || [];
  const processedCount = jobData?.processed_count ?? 0;
  const processingCount = jobData?.processing_count ?? 0;

  // Arrow key navigation in dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (selectedIdx === null) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev !== null && prev < checks.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'Escape') {
        setSelectedIdx(null);
        setExportOpen(false);
      }
    },
    [selectedIdx, checks.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const [reExtracting, setReExtracting] = useState(false);

  const handleExport = (format: string) => {
    window.open(`/api/jobs/${jobId}/export?format=${format}`, '_blank');
    setExportOpen(false);
  };

  const handleReExtract = async (force: boolean = true) => {
    setReExtracting(true);
    try {
      const res = await fetch('/api/start-extraction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, methods: ['ai'], force }),
      });
      if (!res.ok) throw new Error('Failed to start re-extraction');
      window.location.href = `/process/${jobId}?methods=ai`;
    } catch (e: any) {
      console.error('Re-extract error:', e);
      setReExtracting(false);
    }
  };

  const selected = selectedIdx !== null ? checks[selectedIdx] : null;
  const missingCount = checks.filter((c: any) => !c.extraction).length;

  const resetView = () => {
    setImageZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" data-tone="brand">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-semibold text-ink-strong">
            {isComplete ? 'Extraction Results' : 'Processing Cheques'}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-body">
            <span className="truncate">{jobData?.pdf_name || 'Uploading...'}</span>
            {jobData?.doc_format && <Badge tone="brand" size="sm">{jobData.doc_format}</Badge>}
          </p>
        </div>
        {isComplete && checks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={16} />}
              loading={reExtracting}
              onClick={() => handleReExtract(missingCount === 0)}
              title={missingCount > 0 ? `Re-run extraction for ${missingCount} missing cheques` : 'Re-run extraction for all cheques'}
            >
              {missingCount > 0 ? `Re-run (${missingCount} missing)` : 'Re-run extraction'}
            </Button>
            {/* Export dropdown */}
            <div className="relative">
              <Button
                size="sm"
                icon={<Download size={16} />}
                onClick={() => setExportOpen(!exportOpen)}
              >
                Export
                <ChevronRight size={14} className={cn('transition-transform duration-quick ease-settle', exportOpen && 'rotate-90')} />
              </Button>
              {exportOpen && (
                <div className="glass-modal animate-popover-in absolute right-0 z-50 mt-2 w-72 rounded-input py-1">
                  {EXPORT_FORMATS.map((fmt) => (
                    <button
                      key={fmt.id}
                      onClick={() => handleExport(fmt.id)}
                      className="w-full px-4 py-2.5 text-left transition-colors duration-quick ease-settle hover:bg-ink-strong/[0.04]"
                    >
                      <p className="text-sm font-medium text-ink-strong">{fmt.name}</p>
                      <p className="text-xs text-ink-faint">{fmt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="rounded-card border border-error-border bg-error-bg px-4 py-3 text-error-text">
          <p className="font-medium">Processing Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────── */}
      {jobData && (jobData.total_pages > 0 || jobData.total_checks > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile tone="brand" label="Pages" value={jobData.total_pages} icon={<FileText size={20} />} />
          <KpiTile tone="success" label="Cheques" value={jobData.total_checks} icon={<ImageIcon size={20} />} />
          <KpiTile
            tone={isComplete ? 'success' : 'brand'}
            label="Status"
            value={<span className="capitalize">{isComplete ? 'Complete' : jobData.status}</span>}
            icon={<CheckCircle size={20} />}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PROCESSING VIEW (while not complete)

          The Extraction Engines and Live Progress panels were REMOVED
          deliberately (Michael, 21 Sep). Status card + stage stepper only.
         ══════════════════════════════════════════════════════ */}
      {!isComplete && (
        <GlassCard padding="lg">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  progress >= 100 ? 'bg-success-bg' : 'bg-info-bg'
                )}
              >
                {progress >= 100 ? (
                  <CheckCircle className="text-success-text" size={20} />
                ) : (
                  <Loader2 className="animate-spin text-info-text" size={20} />
                )}
              </div>
              <div>
                <GlassCardTitle>
                  {currentStage === 'upload' ? 'Uploading & Validating' :
                   currentStage === 'segmentation' ? 'Detecting Cheques' :
                   currentStage === 'extraction' ? 'Extracting Data' :
                   currentStage === 'merging' ? 'Merging Results' : 'Processing'}
                </GlassCardTitle>
                <p className="nums text-sm text-ink-faint">
                  {processingCount > 0
                    ? `${processedCount} of ${processingCount} cheques processed`
                    : 'Preparing extraction pipeline...'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="nums font-heading text-3xl font-semibold text-ink-strong">{progress}%</p>
              <p className="mt-0.5 text-xs text-ink-faint">overall</p>
            </div>
          </div>

          {/* Progress bar. The WIDTH is the only inline style — it has to be.
              Colour, radius and the inset track are all tokens. */}
          <div
            className="relative h-4 w-full overflow-hidden rounded-pill bg-surface-sunken shadow-inner-track"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-pill bg-gradient-to-r transition-[width] duration-700 ease-settle',
                progress >= 100 ? 'from-success to-success-dark' : 'from-brand-light via-brand to-brand-deep'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Pipeline stage stepper */}
          <div className="mt-4 flex items-start justify-between gap-1">
            {STAGES.map((stage, index) => {
              const isDone = index < stageIndex || (isComplete && index <= stageIndex);
              const isCurrent = index === stageIndex && !isComplete;
              return (
                <div key={stage.name} className="flex flex-1 flex-col items-center gap-1 text-center">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-transform duration-settle ease-settle',
                      isDone && 'bg-success text-white',
                      isCurrent && 'scale-110 bg-brand text-white ring-4 ring-brand/20',
                      !isDone && !isCurrent && 'bg-ink-strong/[0.1] text-ink-faint'
                    )}
                  >
                    {isDone ? '✓' : index + 1}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      isCurrent ? 'text-brand-deep' : isDone ? 'text-success-text' : 'text-ink-faint'
                    )}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Cheque image previews (show during processing too) ── */}
      {!isComplete && checks.length > 0 && (
        <GlassCard padding="lg">
          <GlassCardTitle className="mb-4">Detected Cheques ({checks.length})</GlassCardTitle>
          {/* One blurred container; the tiles inside are GlassPanels with no
              blur of their own, so the cost does not scale with cheque count. */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {checks.map((check: any, idx: number) => (
              <GlassPanel
                key={check.check_id}
                radius="tile"
                padding="none"
                onClick={() => setSelectedIdx(idx)}
                className="press group cursor-pointer overflow-hidden hover:border-brand/40"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
                  <img
                    src={`/api/check-image/${jobId}/${check.check_id}`}
                    alt={`Cheque ${idx + 1}`}
                    className="h-full w-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-ink-strong/0 opacity-0 transition-opacity duration-quick ease-settle group-hover:bg-ink-strong/10 group-hover:opacity-100">
                    <span className="rounded-full bg-white/90 p-1.5 shadow-contact">
                      <Eye size={16} className="text-ink-body" />
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-2 py-2">
                  <span className="text-xs font-medium text-ink-body">Cheque {idx + 1}</span>
                  <span className="nums text-xs text-ink-faint">Page {check.page}</span>
                </div>
              </GlassPanel>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ══════════════════════════════════════════════════════
          RESULTS VIEW (when complete)
         ══════════════════════════════════════════════════════ */}
      {isComplete && checks.length > 0 && (
        <>
          {/* View mode toggle + header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-ink-strong">
              Extracted Cheques ({checks.length})
            </h2>
            <div className="flex items-center gap-3">
              <p className="hidden text-xs text-ink-faint md:block">Click to view details. Arrow keys to navigate.</p>
              <Tabs
                aria-label="Result view"
                value={viewMode}
                onValueChange={(v) => setViewMode(v as ViewMode)}
                items={[
                  { value: 'card', label: 'Cards', icon: <LayoutGrid size={14} /> },
                  { value: 'table', label: 'Table', icon: <List size={14} /> },
                ]}
              />
            </div>
          </div>

          {/* ── Card View ─────────────────────────────────── */}
          {viewMode === 'card' && (
            <GlassCard padding="md">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {checks.map((check: any, idx: number) => {
                  const ext = check.extraction;
                  return (
                    <GlassPanel
                      key={check.check_id}
                      radius="tile"
                      padding="none"
                      onClick={() => setSelectedIdx(idx)}
                      className={cn(
                        'press group cursor-pointer overflow-hidden',
                        selectedIdx === idx ? 'border-brand/70 shadow-glass-selected' : 'hover:border-brand/40'
                      )}
                    >
                      <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
                        <img
                          src={`/api/check-image/${jobId}/${check.check_id}`}
                          alt={`Cheque ${idx + 1}`}
                          className="h-full w-full object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-quick ease-settle group-hover:bg-ink-strong/[0.06] group-hover:opacity-100">
                          <span className="rounded-full bg-white/90 p-2 shadow-contact">
                            <ZoomIn size={18} className="text-ink-body" />
                          </span>
                        </div>
                        <Badge tone="solid" size="sm" className="nums absolute left-2 top-2">#{idx + 1}</Badge>
                        <Badge tone="outline" size="sm" className="nums absolute right-2 top-2">Page {check.page}</Badge>
                      </div>
                      <div className="space-y-2 p-4">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold text-ink-strong">
                            {extVal(ext, 'payee') || 'Unknown Payee'}
                          </p>
                          <p className="nums whitespace-nowrap font-semibold text-success-text">
                            {extVal(ext, 'amount') ? `$${extVal(ext, 'amount')}` : '—'}
                          </p>
                        </div>
                        <div className="nums flex items-center gap-4 text-xs text-ink-faint">
                          {extVal(ext, 'checkDate') && <span>{extVal(ext, 'checkDate')}</span>}
                          {extVal(ext, 'checkNumber') && <span>#{extVal(ext, 'checkNumber')}</span>}
                          {extVal(ext, 'bankName') && <span className="truncate">{extVal(ext, 'bankName')}</span>}
                        </div>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* ── Table View ────────────────────────────────── */}
          {viewMode === 'table' && (
            <TableShell>
              <TableScroll className="max-h-[70vh]">
                <Table>
                  <Thead>
                    <tr>
                      <Th>Preview</Th>
                      <Th numeric>#</Th>
                      <Th numeric>Page</Th>
                      <Th>Payee</Th>
                      <Th numeric>Amount</Th>
                      <Th>Date</Th>
                      <Th numeric>Check #</Th>
                      <Th>Bank</Th>
                      <Th className="text-center">View</Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {checks.map((check: any, idx: number) => {
                      const ext = check.extraction;
                      return (
                        <Tr
                          key={check.check_id}
                          interactive
                          selected={selectedIdx === idx}
                          onClick={() => setSelectedIdx(idx)}
                        >
                          <Td>
                            <div className="h-12 w-20 overflow-hidden rounded-md bg-surface-sunken">
                              <img
                                src={`/api/check-image/${jobId}/${check.check_id}`}
                                alt={`Cheque ${idx + 1}`}
                                className="h-full w-full object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          </Td>
                          <Td numeric muted>{idx + 1}</Td>
                          <Td numeric>{check.page}</Td>
                          <Td className="font-medium">{extVal(ext, 'payee') || '—'}</Td>
                          <Td numeric className="nums-money font-semibold text-success-text">
                            {extVal(ext, 'amount') ? `$${extVal(ext, 'amount')}` : '—'}
                          </Td>
                          <Td className="nums">{extVal(ext, 'checkDate') || '—'}</Td>
                          <Td numeric>{extVal(ext, 'checkNumber') || '—'}</Td>
                          <Td muted>{extVal(ext, 'bankName') || '—'}</Td>
                          <Td className="text-center">
                            <span className="inline-flex text-brand" aria-hidden>
                              <Eye size={16} />
                            </span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableScroll>
            </TableShell>
          )}

          {/* ── Per-method final summary. Deliberately KEPT (post-completion
                 only); this is not the removed Live Progress panel. ───────── */}
          {methodsProgress.length > 0 && (
            <GlassCard padding="lg">
              <GlassCardTitle className="mb-4">Extraction Method Results</GlassCardTitle>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {methodsProgress.map((mp) => (
                  <GlassPanel key={mp.method} radius="tile" padding="md">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-strong">{mp.label}</span>
                      <StatusPill status={METHOD_STATUS[mp.status] ?? 'idle'} size="sm" />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="nums text-ink-body">
                        {mp.checks_processed} / {mp.checks_total} cheques processed
                      </span>
                      <span
                        className={cn(
                          'nums font-semibold',
                          mp.status === 'complete' ? 'text-success-text' : mp.status === 'error' ? 'text-error-text' : 'text-ink-body'
                        )}
                      >
                        {mp.progress}%
                      </span>
                    </div>
                    {mp.error && <p className="mt-2 text-xs text-error-text">{mp.error}</p>}
                  </GlassPanel>
                ))}
              </div>
            </GlassCard>
          )}

          {/* ══════════════════════════════════════════════════
              EXPORT SECTION
             ══════════════════════════════════════════════════ */}
          <GlassCard padding="lg">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <GlassCardTitle>Export Results</GlassCardTitle>
                <p className="mt-0.5 text-sm text-ink-body">Download extracted cheque data in your preferred accounting format</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-faint">
                <CheckCircle size={16} className="text-success" />
                <span className="nums">{checks.length} cheque{checks.length !== 1 ? 's' : ''} ready</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {EXPORT_FORMATS.map((fmt) => (
                <GlassPanel
                  key={fmt.id}
                  radius="tile"
                  padding="md"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExport(fmt.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExport(fmt.id); }}
                  className="press group flex cursor-pointer items-center gap-3 text-left hover:border-brand/40"
                >
                  <span className="shrink-0 rounded-input bg-brand/[0.1] p-2.5 transition-colors duration-quick ease-settle group-hover:bg-brand/20">
                    <Download size={18} className="text-brand-deep" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-strong">{fmt.name}</p>
                    <p className="truncate text-xs text-ink-faint">{fmt.desc}</p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-ink-faint transition-colors duration-quick ease-settle group-hover:text-brand" />
                </GlassPanel>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      {/* ── No results ──────────────────────────────────────── */}
      {isComplete && checks.length === 0 && !error && (
        <GlassCard padding="none" className="p-12 text-center">
          <ImageIcon className="mx-auto mb-4 text-ink-faint/60" size={48} />
          <h3 className="font-heading text-lg font-semibold text-ink-strong">No Cheques Found</h3>
          <p className="mt-1 text-sm text-ink-body">No cheques were detected in this document.</p>
        </GlassCard>
      )}

      {/* ══════════════════════════════════════════════════════
          DETAIL DIALOG
         ══════════════════════════════════════════════════════ */}
      {selected && selectedIdx !== null && (
        <Dialog
          open
          onClose={() => { setSelectedIdx(null); resetView(); }}
          size="full"
          title={`Cheque ${selectedIdx + 1} of ${checks.length}`}
          description={`${selected.check_id} • Page ${selected.page}`}
          className="flex max-h-[92vh] flex-col"
        >
          <div className="flex min-h-0 flex-col gap-3">
            {/* Zoom + navigation toolbar */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="Zoom out"
                  size="icon-sm"
                  disabled={imageZoom <= 0.5}
                  onClick={() => {
                    const next = Math.max(0.5, imageZoom - 0.25);
                    setImageZoom(next);
                    if (next <= 1) setPanOffset({ x: 0, y: 0 });
                  }}
                >
                  <ZoomOut size={16} />
                </IconButton>
                <span className="nums min-w-[2.5rem] text-center text-xs font-medium text-ink-faint">{(imageZoom * 100).toFixed(0)}%</span>
                <IconButton
                  aria-label="Zoom in"
                  size="icon-sm"
                  disabled={imageZoom >= 3}
                  onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))}
                >
                  <ZoomIn size={16} />
                </IconButton>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="Previous cheque"
                  size="icon-sm"
                  disabled={selectedIdx === 0}
                  onClick={() => { setSelectedIdx(Math.max(0, selectedIdx - 1)); resetView(); }}
                >
                  <ChevronLeft size={20} />
                </IconButton>
                <span className="nums text-sm text-ink-faint">{selectedIdx + 1}/{checks.length}</span>
                <IconButton
                  aria-label="Next cheque"
                  size="icon-sm"
                  disabled={selectedIdx === checks.length - 1}
                  onClick={() => { setSelectedIdx(Math.min(checks.length - 1, selectedIdx + 1)); resetView(); }}
                >
                  <ChevronRight size={20} />
                </IconButton>
              </div>
            </div>

            {/* Body: image left, data right */}
            <div className="flex min-h-0 flex-col gap-3 md:flex-row">
              {/* Pan + zoom. The transform and the grab cursor are the only
                  inline styles — both are dynamic maths. */}
              <GlassPanel
                tone="sunken"
                radius="card"
                padding="md"
                className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
                style={{ cursor: imageZoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
                onMouseDown={(e) => {
                  if (imageZoom > 1) {
                    setIsPanning(true);
                    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
                  }
                }}
                onMouseMove={(e) => {
                  if (isPanning && imageZoom > 1) {
                    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
                  }
                }}
                onMouseUp={() => setIsPanning(false)}
                onMouseLeave={() => setIsPanning(false)}
              >
                <img
                  ref={imageRef}
                  src={`/api/check-image/${jobId}/${selected.check_id}`}
                  alt={selected.check_id}
                  className="select-none rounded-input shadow-glass transition-transform duration-settle ease-settle"
                  draggable={false}
                  style={{
                    transform: `scale(${imageZoom}) translate(${panOffset.x / imageZoom}px, ${panOffset.y / imageZoom}px)`,
                    transformOrigin: 'center center',
                    maxWidth: '100%',
                    maxHeight: '62vh',
                    objectFit: 'contain',
                  }}
                />
              </GlassPanel>

              <div className="scroll-region min-h-0 max-h-[62vh] flex-1">
                <h4 className="text-eyebrow mb-4 text-ink-faint">Extracted Data</h4>
                {selected.extraction ? (
                  <div className="space-y-3">
                    {[
                      { label: 'Payee', field: 'payee' },
                      { label: 'Amount', field: 'amount' },
                      { label: 'Date', field: 'checkDate' },
                      { label: 'Check Number', field: 'checkNumber' },
                      { label: 'Bank', field: 'bankName' },
                      { label: 'Memo', field: 'memo' },
                      { label: 'Amount Written', field: 'amountWritten' },
                    ].map(({ label, field }) => {
                      const val = extVal(selected.extraction, field);
                      const conf = extConf(selected.extraction, field);
                      if (!val) return null;
                      return (
                        <GlassPanel key={field} radius="input" padding="sm" className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-ink-faint">{label}</p>
                            <p className={cn('mt-0.5 font-medium text-ink-strong', field === 'amount' && 'nums')}>{val}</p>
                          </div>
                          {conf > 0 && (
                            <Badge tone={confTone(conf)} size="sm" className="nums">
                              {Math.round(conf * 100)}%
                            </Badge>
                          )}
                        </GlassPanel>
                      );
                    })}

                    {/* MICR section */}
                    {selected.extraction.micr && typeof selected.extraction.micr === 'object' && (
                      <div className="mt-4 rounded-input border border-info-border bg-info-bg p-3">
                        <p className="text-eyebrow mb-2 text-info-text">MICR Data</p>
                        <div className="nums space-y-1 text-sm text-ink-strong">
                          {selected.extraction.micr.routing?.value && (
                            <p><span className="text-ink-faint">Routing:</span> {selected.extraction.micr.routing.value}</p>
                          )}
                          {selected.extraction.micr.account?.value && (
                            <p><span className="text-ink-faint">Account:</span> {selected.extraction.micr.account.value}</p>
                          )}
                          {selected.extraction.micr.serial?.value && (
                            <p><span className="text-ink-faint">Serial:</span> {selected.extraction.micr.serial.value}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-ink-faint">No extraction data available yet</p>
                )}

                <div className="mt-6 border-t border-glass-hairline pt-4 text-xs text-ink-faint">
                  {selected.width > 0 && <p className="nums">Dimensions: {selected.width} x {selected.height}px</p>}
                  <p className="mt-1">Use arrow keys to navigate between cheques</p>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
