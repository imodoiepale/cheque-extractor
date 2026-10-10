import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, FileCheck, DollarSign, Edit2, Save, XCircle, CheckCircle2, Ban, Wrench } from 'lucide-react';
import {
  Button,
  Dialog,
  GlassPanel,
  Input,
  StatusPill,
  Table,
  TableScroll,
  TableShell,
  Tbody,
  Td,
  Textarea,
  Th,
  Tr,
  type StatusKey,
} from '@/components/ui';
import {
  ComparisonRow,
  formatCurrency,
  formatDate,
  parseAmount,
  areDatesSameCalendarDay,
  normalizeCheckNum,
} from '../utils/comparisonUtils';
import { applyFixToQB, computeCorrections } from '../utils/fixDiscrepancy';

interface DetailModalProps {
  row: ComparisonRow | null;
  onClose: () => void;
  onSave?: (checkId: string, updates: any) => Promise<void>;
  onApprove?: (checkId: string) => Promise<void>;
  onReject?: (checkId: string) => Promise<void>;
  onFixed?: () => void;
}

/** Same vocabulary the grid uses, so a word is never two colours. */
const MATCH_STATUS: Record<ComparisonRow['matchStatus'], { status: StatusKey; label: string }> = {
  matched: { status: 'matched', label: 'Matched' },
  mismatch: { status: 'review', label: 'Mismatch' },
  'missing-in-qb': { status: 'processing', label: 'Missing in QB' },
  'missing-in-extraction': { status: 'failed', label: 'Missing in Checks' },
};

/** Inline comparison tables sit inside the blurred modal, so: label only. */
const SECTION_LABEL = 'mb-2 text-eyebrow text-ink-faint';

/** One banner recipe for the three action outcomes. */
const BANNER: Record<'success' | 'error' | 'info', string> = {
  success: 'border-success-border bg-success-bg text-success-text',
  error: 'border-error-border bg-error-bg text-error-text',
  info: 'border-info-border bg-info-bg text-info-text',
};

/**
 * Sticky header for a table nested INSIDE the blurred modal. Deliberately a
 * plain <thead>, not the `Thead` primitive: `Thead` carries `.glass-chrome`,
 * and a blurred header inside a blurred modal is two stacked backdrop filters
 * (rule 2). The <th> cells are still the one shared `Th` recipe.
 */
const InsetThead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="sticky top-0 z-10 bg-surface/95">{children}</thead>
);

/** Label + value, or label + editor in edit mode. Module scope on purpose. */
const FieldRow: React.FC<{
  label: string;
  value: React.ReactNode;
  editor?: React.ReactNode;
  editing?: boolean;
}> = ({ label, value, editor, editing }) => (
  <div>
    <span className="text-xs font-medium text-ink-faint">{label}</span>
    {editing && editor ? editor : <p className="mt-1 text-sm font-semibold text-ink-strong">{value}</p>}
  </div>
);

const Match = () => <span className="font-semibold text-success-text">✓ Match</span>;
const Different = () => <span className="font-semibold text-warning-text">⚠ Different</span>;

export const DetailModal: React.FC<DetailModalProps> = ({ row, onClose, onSave, onApprove, onReject, onFixed }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [fixMessage, setFixMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editedData, setEditedData] = useState({
    checkNumber: '',
    date: '',
    amount: '',
    payee: '',
    bankAccount: '',
    memo: '',
  });

  // Update editedData when row changes
  useEffect(() => {
    if (row) {
      setEditedData({
        checkNumber: row.checkNumber || '',
        date: row.date || '',
        amount: row.amount || '',
        payee: row.payee || '',
        bankAccount: row.bankAccount || '',
        memo: row.memo || '',
      });
    }
  }, [row]);

  // #region agent log (off by default; enable via localStorage.setItem('kyriqDebugIngest', JSON.stringify({ url, sessionId })))
  useEffect(() => {
    if (!row?.qbData) return;
    let cfg: { url: string; sessionId: string } | null = null;
    try { cfg = JSON.parse(localStorage.getItem('kyriqDebugIngest') || 'null'); } catch {}
    if (!cfg?.url) return;
    const a = row.date ?? '';
    const b = row.qbData.date ?? '';
    fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': cfg.sessionId || '76c285' },
      body: JSON.stringify({
        sessionId: cfg.sessionId || '76c285',
        runId: 'ext-audit',
        hypothesisId: 'H-UI',
        location: 'DetailModal.tsx:dateCompare',
        message: 'modal row date vs qb date (strict eq drives ⚠ Different cell)',
        data: {
          rowDateRawLen: a.length,
          qbDateRawLen: b.length,
          strictEqual: a === b,
          normalizedEqual: areDatesSameCalendarDay(a, b),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [row?.id, row?.date, row?.qbData?.date]);
  // #endregion

  // Must sit ABOVE the early return: when `row` goes from set to null this
  // component returns before the hook, so React sees fewer hooks than the
  // previous render and throws. The `row ?` guard already makes it safe here.
  const corrections = useMemo(() => row ? computeCorrections(row) : {}, [row]);

  if (!row) return null;

  const handleApprove = async () => {
    if (!onApprove || !row?.extractionData?.check_id) return;
    setApproveError(null);
    setApproveSuccess(false);
    setIsApproving(true);
    try {
      await onApprove(row.extractionData.check_id);
      setApproveSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (error: any) {
      console.error('Failed to approve:', error);
      setApproveError(error.message || 'Failed to approve check. Please try again.');
    } finally {
      setIsApproving(false);
    }
  };

  const correctionCount = Object.keys(corrections).length;

  const handleFixInQB = async () => {
    if (!row) return;
    setFixMessage(null);
    if (correctionCount === 0) {
      setFixMessage({ type: 'info', text: 'Nothing to fix — extraction and QuickBooks values already match.' });
      return;
    }
    setIsFixing(true);
    try {
      const result = await applyFixToQB(row);
      if (result.skipped) {
        setFixMessage({ type: 'info', text: result.reason || 'Skipped — no changes' });
      } else if (result.ok) {
        const parts = Object.entries(result.fields || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
        setFixMessage({ type: 'success', text: `Fixed in QuickBooks ✓ ${parts ? `(${parts})` : ''}` });
        onFixed?.();
      } else {
        setFixMessage({ type: 'error', text: result.reason || 'Fix failed' });
      }
    } catch (e: any) {
      setFixMessage({ type: 'error', text: e?.message || 'Fix failed' });
    } finally {
      setIsFixing(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !row?.extractionData?.check_id) return;
    setApproveError(null);
    setIsRejecting(true);
    try {
      await onReject(row.extractionData.check_id);
      onClose();
    } catch (error: any) {
      console.error('Failed to reject:', error);
      setApproveError(error.message || 'Failed to reject check. Please try again.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleSave = async () => {
    if (!onSave || !row.extractionData) return;

    setIsSaving(true);
    try {
      await onSave(row.extractionData.check_id, editedData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save changes:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData({
      checkNumber: row?.checkNumber || '',
      date: row?.date || '',
      amount: row?.amount || '',
      payee: row?.payee || '',
      bankAccount: row?.bankAccount || '',
      memo: row?.memo || '',
    });
    setIsEditing(false);
  };

  const ext = row.extractionData;
  const extField = (field: 'checkNumber' | 'checkDate' | 'amount' | 'payee' | 'bankName' | 'memo') => {
    const v = ext?.extraction?.[field];
    if (!v) return '';
    return typeof v === 'object' ? v.value : v;
  };


  return (
    <Dialog
      open
      onClose={onClose}
      size="full"
      title={`Check #${row.checkNumber || 'N/A'}`}
      description={isEditing ? 'Edit mode — correct the extraction data' : 'Detailed comparison view'}
      className="max-h-[92vh] overflow-hidden"
      footer={
        row.extractionData && (onApprove || onReject) ? (
          <div className="flex w-full flex-col gap-3">
            {approveError && (
              <div className={`flex items-start gap-2 rounded-input border px-3 py-2 text-sm ${BANNER.error}`} role="alert">
                <span aria-hidden>⚠</span>
                <span>{approveError}</span>
              </div>
            )}
            {approveSuccess && (
              <div className={`flex items-center gap-2 rounded-input border px-3 py-2 text-sm ${BANNER.success}`} role="status">
                <CheckCircle2 size={15} />
                <span>Approved! Closing…</span>
              </div>
            )}
            {fixMessage && (
              <div className={`flex items-start gap-2 rounded-input border px-3 py-2 text-sm ${BANNER[fixMessage.type]}`} role="status">
                <span aria-hidden>
                  {fixMessage.type === 'success' ? '✓' : fixMessage.type === 'error' ? '⚠' : 'ℹ'}
                </span>
                <span>{fixMessage.text}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="mr-auto text-xs font-medium text-ink-faint">
                Actions for Check #{row.checkNumber || row.extractionData.check_id}
              </span>
              {row.matchStatus === 'mismatch' && row.qbData && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleFixInQB}
                  loading={isFixing}
                  icon={<Wrench size={16} />}
                  disabled={isApproving || isRejecting || approveSuccess || correctionCount === 0}
                  title={correctionCount === 0
                    ? 'No differences to push'
                    : `Push ${correctionCount} field${correctionCount === 1 ? '' : 's'} to QuickBooks: ${Object.keys(corrections).join(', ')}`}
                >
                  {isFixing ? 'Fixing…' : `Fix in QB${correctionCount > 0 ? ` (${correctionCount})` : ''}`}
                </Button>
              )}
              {onApprove && (
                <Button
                  size="sm"
                  onClick={handleApprove}
                  loading={isApproving}
                  icon={<CheckCircle2 size={16} />}
                  disabled={isRejecting || approveSuccess}
                  title={row.qbData ? 'Approve and stamp Cleared note in QuickBooks' : 'Approve in Kyriq only — no QB transaction linked'}
                >
                  {isApproving
                    ? 'Approving…'
                    : approveSuccess
                      ? '✓ Approved'
                      : row.qbData
                        ? 'Approve & Clear'
                        : 'Approve'}
                </Button>
              )}
              {onReject && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReject}
                  loading={isRejecting}
                  icon={<Ban size={16} />}
                  disabled={isApproving || approveSuccess}
                >
                  {isRejecting ? 'Rejecting…' : 'Reject'}
                </Button>
              )}
            </div>
          </div>
        ) : null
      }
    >
      <div className="scroll-region max-h-[68vh] space-y-5 pr-1">
        {/* Edit / save controls. In the body rather than the header so the
            Dialog primitive's one header recipe is not special-cased. */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill status={MATCH_STATUS[row.matchStatus].status} label={MATCH_STATUS[row.matchStatus].label} />
          {row.confidence !== undefined && (
            <span className="text-sm text-ink-body">
              Confidence:{' '}
              <span
                className={`nums font-semibold ${
                  row.confidence >= 80
                    ? 'text-success-text'
                    : row.confidence >= 60
                      ? 'text-warning-text'
                      : 'text-error-text'
                }`}
              >
                {row.confidence}%
              </span>
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {!isEditing ? (
              <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)} icon={<Edit2 size={16} />}>
                Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSave} loading={isSaving} icon={<Save size={16} />}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving} icon={<XCircle size={16} />}>
                  Cancel
                </Button>
              </>
            )}
          </span>
        </div>

        {/* Check image */}
        {(ext?.image_file || ext?.image_url || ext?.storage_url) && (
          <div>
            <p className={SECTION_LABEL}>Check Image</p>
            <GlassPanel radius="card" padding="sm">
              <img
                src={(() => {
                  // Priority 1: storage_url (Supabase Storage direct URL)
                  if (ext.storage_url) return ext.storage_url;

                  // Priority 2: image_url (full URL)
                  if (ext.image_url) return ext.image_url;

                  // Priority 3: image_file if it's a full URL
                  if (ext.image_file?.startsWith('http')) return ext.image_file;

                  // Priority 4: Backend API endpoint (works even if local files are cleaned up)
                  return `/api/check-image/${ext.job_id}/${ext.check_id}`;
                })()}
                alt="Check"
                className="max-h-96 w-full rounded-input object-contain shadow-contact"
                onError={(e) => {
                  console.error('Image failed to load:', {
                    storage_url: ext?.storage_url,
                    image_url: ext?.image_url,
                    image_file: ext?.image_file,
                    check_id: ext?.check_id,
                    job_id: ext?.job_id,
                  });
                  const target = e.currentTarget;
                  target.parentElement!.innerHTML =
                    '<div class="py-8 text-center text-sm text-ink-faint">Image not available</div>';
                }}
              />
            </GlassPanel>
          </div>
        )}

        {row.discrepancies && row.discrepancies.length > 0 && (
          <div>
            <p className={SECTION_LABEL}>Discrepancies</p>
            <div className="space-y-2">
              {row.discrepancies.map((disc, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 rounded-input border px-4 py-2.5 text-sm ${BANNER.error}`}
                >
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
                  <span>{disc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data comparison */}
        <div>
          <p className={SECTION_LABEL}>Data Comparison</p>
          <TableShell tier="inset">
            <TableScroll>
              <Table className="text-xs [&_td]:py-1.5">
                <InsetThead>
                  <tr>
                    <Th>Field</Th>
                    <Th>Check Extraction</Th>
                    <Th>QuickBooks</Th>
                    <Th className="text-center">Difference</Th>
                  </tr>
                </InsetThead>
                <Tbody>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Check Number</Td>
                    <Td className="nums">{ext?.checkNumber || row.checkNumber || '—'}</Td>
                    <Td className="nums">{row.qbData?.checkNumber || '—'}</Td>
                    <Td className="text-center">
                      {ext && row.qbData &&
                      (normalizeCheckNum(row.checkNumber) || row.checkNumber?.trim()) ===
                        (normalizeCheckNum(row.qbData.checkNumber) || row.qbData.checkNumber?.trim())
                        ? <Match />
                        : <Different />}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Date</Td>
                    <Td muted className="nums">{ext && row.date ? formatDate(row.date) : '—'}</Td>
                    <Td muted className="nums">{row.qbData?.date ? formatDate(row.qbData.date) : '—'}</Td>
                    <Td className="text-center">
                      {ext && row.qbData && areDatesSameCalendarDay(row.date, row.qbData.date)
                        ? <Match />
                        : <Different />}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Amount</Td>
                    <Td className="nums-money font-semibold text-success-text">
                      {ext && row.amount ? formatCurrency(row.amount) : '—'}
                    </Td>
                    <Td className="nums-money font-semibold text-success-text">
                      {row.qbData?.amount ? formatCurrency(row.qbData.amount) : '—'}
                    </Td>
                    <Td className="text-center">
                      {ext && row.qbData ? (
                        Math.abs(parseAmount(row.amount) - parseAmount(row.qbData.amount)) < 0.01 ? (
                          <Match />
                        ) : (
                          <span className="nums font-semibold text-error-text">
                            Δ {formatCurrency(Math.abs(parseAmount(row.amount) - parseAmount(row.qbData.amount)))}
                          </span>
                        )
                      ) : '—'}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Payee</Td>
                    <Td>{ext ? row.payee || '—' : '—'}</Td>
                    <Td>{row.qbData?.payee || '—'}</Td>
                    <Td className="text-center">
                      {ext && row.qbData && row.payee?.toLowerCase() === row.qbData.payee?.toLowerCase()
                        ? <Match />
                        : <Different />}
                    </Td>
                  </Tr>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Bank/Account</Td>
                    <Td muted>{ext ? row.bankAccount || '—' : '—'}</Td>
                    <Td muted>{row.qbData?.account || '—'}</Td>
                    <Td className="text-center">—</Td>
                  </Tr>
                  <Tr>
                    <Td className="font-semibold text-ink-body">Memo</Td>
                    <Td muted>{ext ? row.memo || '—' : '—'}</Td>
                    <Td muted>{row.qbData?.memo || '—'}</Td>
                    <Td className="text-center">—</Td>
                  </Tr>
                  {row.qbData?.qbSource && (
                    <Tr state="none">
                      <Td className="font-semibold text-ink-body">QB Source</Td>
                      <Td muted>—</Td>
                      <Td className="font-semibold text-brand-deep">{row.qbData.qbSource}</Td>
                      <Td className="text-center">—</Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableScroll>
          </TableShell>
        </div>

        {/* Extraction methods comparison */}
        {ext && (
          <div>
            <p className={SECTION_LABEL}>Extraction Methods Comparison</p>
            <TableShell tier="inset">
              <TableScroll>
                <Table className="text-xs [&_td]:py-1.5">
                  <InsetThead>
                    <tr>
                      <Th>Field</Th>
                      <Th>OCR Extraction</Th>
                      <Th>AI Vision</Th>
                      <Th>Manual Entry</Th>
                    </tr>
                  </InsetThead>
                  <Tbody>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Check Number</Td>
                      <Td className="nums">{extField('checkNumber') || '—'}</Td>
                      <Td className="nums">{ext.checkNumber || '—'}</Td>
                      <Td muted>—</Td>
                    </Tr>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Date</Td>
                      <Td muted className="nums">
                        {extField('checkDate') ? formatDate(extField('checkDate')) : '—'}
                      </Td>
                      <Td muted className="nums">{row.date ? formatDate(row.date) : '—'}</Td>
                      <Td muted>—</Td>
                    </Tr>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Amount</Td>
                      <Td className="nums-money font-semibold text-success-text">
                        {extField('amount') ? formatCurrency(extField('amount')) : '—'}
                      </Td>
                      <Td className="nums-money font-semibold text-success-text">
                        {row.amount ? formatCurrency(row.amount) : '—'}
                      </Td>
                      <Td muted>—</Td>
                    </Tr>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Payee</Td>
                      <Td>{extField('payee') || '—'}</Td>
                      <Td>{row.payee || '—'}</Td>
                      <Td muted>—</Td>
                    </Tr>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Bank</Td>
                      <Td muted>{extField('bankName') || '—'}</Td>
                      <Td muted>{row.bankAccount || '—'}</Td>
                      <Td muted>—</Td>
                    </Tr>
                    <Tr>
                      <Td className="font-semibold text-ink-body">Memo</Td>
                      <Td muted>{extField('memo') || '—'}</Td>
                      <Td muted>{row.memo || '—'}</Td>
                      <Td muted>—</Td>
                    </Tr>
                  </Tbody>
                </Table>
              </TableScroll>
            </TableShell>
          </div>
        )}

        {/* Side-by-side sources */}
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className={`${SECTION_LABEL} flex items-center gap-2`}>
              <FileCheck size={14} aria-hidden />
              Extraction Source
            </p>
            {ext ? (
              <GlassPanel radius="card" className="space-y-3">
                <FieldRow editing={isEditing} label="Source:" value={ext.pdf_name} />
                <FieldRow editing={isEditing} label="Page:" value={ext.page} />
                <FieldRow
                  editing={isEditing}
                  label="Check Number:"
                  value={row.checkNumber || '—'}
                  editor={
                    <Input
                      inputSize="sm"
                      aria-label="Check number"
                      className="mt-1"
                      value={editedData.checkNumber}
                      onChange={(e) => setEditedData({ ...editedData, checkNumber: e.target.value })}
                    />
                  }
                />
                <FieldRow
                  editing={isEditing}
                  label="Date:"
                  value={row.date ? formatDate(row.date) : '—'}
                  editor={
                    <Input
                      inputSize="sm"
                      type="date"
                      aria-label="Check date"
                      className="mt-1"
                      value={editedData.date}
                      onChange={(e) => setEditedData({ ...editedData, date: e.target.value })}
                    />
                  }
                />
                <FieldRow
                  editing={isEditing}
                  label="Amount:"
                  value={
                    <span className="nums text-success-text">
                      {row.amount ? formatCurrency(row.amount) : '—'}
                    </span>
                  }
                  editor={
                    <Input
                      inputSize="sm"
                      type="number"
                      step="0.01"
                      aria-label="Amount"
                      className="nums mt-1"
                      value={editedData.amount}
                      onChange={(e) => setEditedData({ ...editedData, amount: e.target.value })}
                    />
                  }
                />
                <FieldRow
                  editing={isEditing}
                  label="Payee:"
                  value={row.payee || '—'}
                  editor={
                    <Input
                      inputSize="sm"
                      aria-label="Payee"
                      className="mt-1"
                      value={editedData.payee}
                      onChange={(e) => setEditedData({ ...editedData, payee: e.target.value })}
                    />
                  }
                />
                <FieldRow
                  editing={isEditing}
                  label="Bank:"
                  value={row.bankAccount || '—'}
                  editor={
                    <Input
                      inputSize="sm"
                      aria-label="Bank"
                      className="mt-1"
                      value={editedData.bankAccount}
                      onChange={(e) => setEditedData({ ...editedData, bankAccount: e.target.value })}
                    />
                  }
                />
                <FieldRow
                  editing={isEditing}
                  label="Memo:"
                  value={row.memo || '—'}
                  editor={
                    <Textarea
                      inputSize="sm"
                      rows={2}
                      aria-label="Memo"
                      className="mt-1 resize-none"
                      value={editedData.memo}
                      onChange={(e) => setEditedData({ ...editedData, memo: e.target.value })}
                    />
                  }
                />
              </GlassPanel>
            ) : (
              <GlassPanel tone="plain" radius="card" className="text-sm text-ink-faint">
                No extraction data available
              </GlassPanel>
            )}
          </div>

          <div>
            <p className={`${SECTION_LABEL} flex items-center gap-2`}>
              <DollarSign size={14} aria-hidden />
              QuickBooks Data
            </p>
            {row.qbData ? (
              <GlassPanel radius="card" className="space-y-3">
                <FieldRow editing={isEditing} label="QB Source:" value={row.qbData.qbSource || 'Default'} />
                <FieldRow editing={isEditing} label="Check Number:" value={row.qbData.checkNumber || '—'} />
                <FieldRow editing={isEditing} label="Date:" value={row.qbData.date ? formatDate(row.qbData.date) : '—'} />
                <FieldRow
                  editing={isEditing}
                  label="Amount:"
                  value={
                    <span className="nums text-success-text">
                      {row.qbData.amount ? formatCurrency(row.qbData.amount) : '—'}
                    </span>
                  }
                />
                <FieldRow editing={isEditing} label="Payee:" value={row.qbData.payee || '—'} />
                <FieldRow editing={isEditing} label="Account:" value={row.qbData.account || '—'} />
                <FieldRow editing={isEditing} label="Memo:" value={row.qbData.memo || '—'} />
              </GlassPanel>
            ) : (
              <GlassPanel tone="plain" radius="card" className="text-sm text-ink-faint">
                No QuickBooks data available
              </GlassPanel>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
