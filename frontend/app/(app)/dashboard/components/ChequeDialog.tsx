'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, RefreshCw, Eye, Edit2, Save, XCircle } from 'lucide-react';
import {
  Badge, Button, Dialog, GlassPanel, IconButton, Input, Tabs,
  Table, TableScroll, TableShell, Tbody, Td, Th, Thead, Tr,
} from '@/components/ui';

interface Check {
  check_id: string;
  page: number;
  extraction?: any;
  methods_used?: string[];
  engine_results?: Record<string, any>;
  engine_times_ms?: Record<string, number>;
}

interface Job {
  job_id: string;
  pdf_name: string;
  checks: Check[];
}

interface Props {
  job: Job;
  selectedCheckIdx: number;
  onClose: () => void;
  onNavigate: (idx: number) => void;
  onExport: (jobId: string, format: string) => void;
  onReExtract: (jobId: string) => void;
  reExtracting: boolean;
}

/** Same dense recipe as the dashboard list: text-xs at py-1.5, not py-3. */
const DENSE_CELL = 'px-2 py-1.5';

const EXPORT_FORMATS = [
  { id: 'csv', name: 'Generic CSV', desc: 'Excel, Google Sheets' },
  { id: 'iif', name: 'QuickBooks Desktop', desc: 'IIF format' },
  { id: 'qbo', name: 'QuickBooks Online', desc: 'CSV bank import' },
  { id: 'xero', name: 'Xero', desc: 'Bank statement CSV' },
];

const FIELDS = [
  { label: 'Payee', field: 'payee' },
  { label: 'Amount', field: 'amount' },
  { label: 'Date', field: 'checkDate' },
  { label: 'Check #', field: 'checkNumber' },
  { label: 'Bank', field: 'bankName' },
  { label: 'Memo', field: 'memo' },
] as const;

function extVal(ext: any, field: string): string {
  if (!ext) return '';
  const f = ext[field];
  if (typeof f === 'object' && f !== null) return f.value || '';
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  return '';
}

function blankEdits(ext: any) {
  return {
    checkNumber: extVal(ext, 'checkNumber'),
    checkDate: extVal(ext, 'checkDate'),
    amount: extVal(ext, 'amount'),
    payee: extVal(ext, 'payee'),
    bankName: extVal(ext, 'bankName'),
    memo: extVal(ext, 'memo'),
  };
}

export default function ChequeDialog({ job, selectedCheckIdx, onClose, onNavigate, onExport, onReExtract, reExtracting }: Props) {
  const [viewMode, setViewMode] = useState<'image' | 'table' | 'pdf'>('image');
  const [imageZoom, setImageZoom] = useState(1);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedCheck = job.checks[selectedCheckIdx];

  const [editedData, setEditedData] = useState(() => blankEdits(selectedCheck?.extraction));

  const handleSave = async () => {
    if (!selectedCheck) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/checks/${selectedCheck.check_id}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedData),
      });

      if (!res.ok) throw new Error('Failed to save');

      // Update local check data
      selectedCheck.extraction = { ...selectedCheck.extraction, ...editedData };

      setIsEditing(false);
    } catch (error: any) {
      console.error('Failed to save:', error);
      setSaveError(error?.message || 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData(blankEdits(selectedCheck?.extraction));
    setSaveError(null);
    setIsEditing(false);
  };

  const goTo = (idx: number) => {
    onNavigate(idx);
    setImageZoom(1);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="full"
      title={`Cheque ${selectedCheckIdx + 1} of ${job.checks.length}`}
      description={`${job.pdf_name} • Page ${selectedCheck.page}`}
      className="flex h-[90vh] flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* ── Toolbar ───────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Export dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-0 px-2.5 py-1.5 text-xs"
                icon={<Download size={13} />}
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              >
                Export
              </Button>
              {exportDropdownOpen && (
                // Popover tier: it sits over the modal, so it owns the blur.
                <div className="glass-modal animate-popover-in absolute left-0 z-50 mt-1 w-56 rounded-input py-1">
                  {EXPORT_FORMATS.map((fmt) => (
                    <button
                      key={fmt.id}
                      onClick={() => { onExport(job.job_id, fmt.id); setExportDropdownOpen(false); }}
                      className="w-full px-3 py-2 text-left transition-colors duration-quick ease-settle hover:bg-ink-strong/[0.04]"
                    >
                      <p className="text-xs font-medium text-ink-strong">{fmt.name}</p>
                      <p className="text-[10px] text-ink-faint">{fmt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Re-extract */}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-0 px-2.5 py-1.5 text-xs"
              icon={<RefreshCw size={13} />}
              loading={reExtracting}
              onClick={() => onReExtract(job.job_id)}
            >
              Re-extract
            </Button>

            {/* Edit / Save / Cancel */}
            {!isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                className="min-h-0 px-2.5 py-1.5 text-xs"
                icon={<Edit2 size={13} />}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="min-h-0 px-2.5 py-1.5 text-xs"
                  icon={<Save size={13} />}
                  loading={isSaving}
                  onClick={handleSave}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-0 px-2.5 py-1.5 text-xs"
                  icon={<XCircle size={13} />}
                  disabled={isSaving}
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Badge tone="brand" size="sm">Edit mode</Badge>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Tabs
              aria-label="Cheque view"
              value={viewMode}
              onValueChange={(v) => setViewMode(v as typeof viewMode)}
              items={[
                { value: 'image', label: 'Image' },
                { value: 'table', label: 'Table' },
                { value: 'pdf', label: 'PDF' },
              ]}
            />

            {viewMode === 'image' && (
              <div className="flex items-center gap-1">
                <IconButton
                  aria-label="Zoom out"
                  size="icon-sm"
                  onClick={() => setImageZoom(Math.max(0.5, imageZoom - 0.25))}
                  disabled={imageZoom <= 0.5}
                >
                  <ZoomOut size={14} />
                </IconButton>
                <span className="nums min-w-[2.5rem] text-center text-xs text-ink-faint">{(imageZoom * 100).toFixed(0)}%</span>
                <IconButton
                  aria-label="Zoom in"
                  size="icon-sm"
                  onClick={() => setImageZoom(Math.min(3, imageZoom + 0.25))}
                  disabled={imageZoom >= 3}
                >
                  <ZoomIn size={14} />
                </IconButton>
              </div>
            )}

            <div className="flex items-center gap-1">
              <IconButton
                aria-label="Previous cheque"
                size="icon-sm"
                onClick={() => goTo(Math.max(0, selectedCheckIdx - 1))}
                disabled={selectedCheckIdx === 0}
              >
                <ChevronLeft size={16} />
              </IconButton>
              <span className="nums text-xs text-ink-faint">{selectedCheckIdx + 1}/{job.checks.length}</span>
              <IconButton
                aria-label="Next cheque"
                size="icon-sm"
                onClick={() => goTo(Math.min(job.checks.length - 1, selectedCheckIdx + 1))}
                disabled={selectedCheckIdx === job.checks.length - 1}
              >
                <ChevronRight size={16} />
              </IconButton>
            </div>
          </div>
        </div>

        {saveError && (
          <p role="alert" className="rounded-input border border-error-border bg-error-bg px-3 py-2 text-xs font-medium text-error-text">
            {saveError}
          </p>
        )}

        {/* ── Body ──────────────────────────────────── */}
        {viewMode === 'pdf' ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-card border border-glass-hairline bg-surface-sunken">
            <iframe
              src={`/api/pdf-file/${job.job_id}`}
              className="h-full w-full border-0"
              title="PDF Viewer"
            />
          </div>
        ) : viewMode === 'image' ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
            {/* Image — zoom stays an inline transform; everything else is a token. */}
            <GlassPanel tone="sunken" radius="card" padding="md" className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <img
                src={`/api/check-image/${job.job_id}/${selectedCheck.check_id}`}
                alt=""
                className="rounded-input shadow-glass transition-transform duration-settle ease-settle"
                style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center', maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
              />
            </GlassPanel>

            {/* Extraction Data */}
            <div className="scroll-region min-h-0 flex-1">
              <h4 className="text-eyebrow mb-2 text-ink-faint">
                {isEditing ? 'Edit Extraction Data' : 'Extraction Data'}
              </h4>
              {selectedCheck.extraction && (
                <div className="space-y-3">
                  {FIELDS.map(({ label, field }) => (
                    <div key={field} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 text-ink-faint">{label}</span>
                      {isEditing ? (
                        <Input
                          inputSize="sm"
                          value={editedData[field as keyof typeof editedData]}
                          onChange={(e) => setEditedData({ ...editedData, [field]: e.target.value })}
                          placeholder={`Enter ${label.toLowerCase()}`}
                          className={field === 'amount' ? 'nums' : undefined}
                        />
                      ) : (
                        <span className={`font-medium text-ink-strong${field === 'amount' ? ' nums' : ''}`}>
                          {extVal(selectedCheck.extraction, field) || '—'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <TableShell tier="inset" className="flex min-h-0 flex-1 flex-col">
            <TableScroll className="min-h-0 flex-1">
              <Table className="text-xs">
                <Thead>
                  <tr>
                    <Th className={DENSE_CELL}>#</Th>
                    <Th className={DENSE_CELL}>Preview</Th>
                    <Th className={DENSE_CELL}>Payee</Th>
                    <Th numeric className={DENSE_CELL}>Amount</Th>
                    <Th className={DENSE_CELL}>Date</Th>
                    <Th numeric className={DENSE_CELL}>Check #</Th>
                    <Th numeric className={DENSE_CELL}>Page</Th>
                    <Th className={`${DENSE_CELL} text-center`}>View</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {job.checks.map((check, idx) => (
                    <Tr key={check.check_id} interactive selected={idx === selectedCheckIdx} onClick={() => goTo(idx)}>
                      <Td numeric muted className={DENSE_CELL}>{idx + 1}</Td>
                      <Td className={DENSE_CELL}>
                        <div className="h-7 w-12 overflow-hidden rounded-md bg-surface-sunken">
                          <img
                            src={`/api/check-image/${job.job_id}/${check.check_id}`}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      </Td>
                      <Td className={`${DENSE_CELL} font-medium`}>{extVal(check.extraction, 'payee') || '—'}</Td>
                      <Td numeric className={`${DENSE_CELL} nums-money font-semibold text-success-text`}>{extVal(check.extraction, 'amount') || '—'}</Td>
                      <Td className={`${DENSE_CELL} nums text-ink-body`}>{extVal(check.extraction, 'checkDate') || '—'}</Td>
                      <Td numeric className={`${DENSE_CELL} text-ink-body`}>{extVal(check.extraction, 'checkNumber') || '—'}</Td>
                      <Td numeric muted className={DENSE_CELL}>{check.page}</Td>
                      <Td className={`${DENSE_CELL} text-center`}>
                        <span className="inline-flex text-brand" aria-hidden>
                          <Eye size={12} />
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableScroll>
          </TableShell>
        )}
      </div>
    </Dialog>
  );
}
