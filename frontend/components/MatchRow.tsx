'use client';

import { useState } from 'react';
import {
  Check, Flag, FileText, ChevronDown, ChevronUp, Search, Plus, Undo2,
  AlertTriangle, Pencil, CheckCircle2, Repeat, HelpCircle,
} from 'lucide-react';
import {
  GlassPanel, StatusPill, Badge, Input, Textarea, Field,
  type StatusKey,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * MatchRow — one check against one QuickBooks transaction.
 *
 * Three rules this file is held to by scripts/check-parcel-h.ts:
 *
 *  1. The row is a GlassPanel, never a GlassCard. A match list is long, and a
 *     blurred row is one compositing layer per row.
 *  2. Row height is `ROW_CELL` and is declared once. The pre-redesign row was
 *     px-4 py-3 and it stays px-4 py-3 — the premium look costs no rows.
 *  3. The only inline `style` left is ScoreBar's width, which is genuine
 *     maths. Every colour, radius and shadow comes from a token.
 */

/** Declared once. The grid row was px-4 py-3 before the redesign; it still is. */
const ROW_CELL = 'px-4 py-3';

/**
 * Dense row buttons.
 *
 * These are NOT the `Button` primitive, for two separate reasons:
 *
 *  1. Button's `secondary` variant IS `.glass-card` and `ghost` carries
 *     `backdrop-blur-[8px]`. Either one would put a compositing layer on every
 *     row of a list that runs to hundreds.
 *  2. `size="sm"` is `min-h-tap` (2.75rem), and overriding it through
 *     `className` does NOT work: tailwind-merge does not recognise the custom
 *     `min-h-tap` / `min-h-btn` theme keys, so it keeps both classes and the
 *     44px floor wins. Measured: the row grew 120.5px -> 132px before this was
 *     caught. Density does not regress, so the row pill is declared here.
 *
 * Both reasons are reported as primitive gaps rather than patched in the
 * primitive. The 44px tap floor is deliberately traded away INSIDE a row, which
 * is where it already was before the redesign.
 */
const ROW_BTN_BASE = [
  'press inline-flex min-h-0 items-center justify-center gap-1 whitespace-nowrap',
  'rounded-full px-2.5 py-1 text-xs font-semibold',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'disabled:pointer-events-none disabled:opacity-disabled',
].join(' ');
const ROW_BTN_PRIMARY = [
  ROW_BTN_BASE,
  'bg-gradient-to-r from-brand to-brand-dark text-white shadow-brand-glow',
  'hover:from-brand-light hover:to-brand',
].join(' ');
const ROW_BTN_QUIET = [
  ROW_BTN_BASE,
  'border border-glass-hairline bg-surface/70 text-ink-body',
  'hover:bg-brand/[0.06] hover:text-ink-strong',
].join(' ');
/** Expanded sub-panels. Same 1.5rem gutter the old `px-6 py-3` had. */
const PANEL_CELL = 'px-6 py-3';

/**
 * The match vocabulary mapped onto the canonical StatusPill keys. `discrepancy`
 * and `flagged` are NOT keys in STATUS_TONES, so they alias onto keys that are
 * (`error`, `review`) rather than introducing two new status colours.
 *
 * The accent stripe is derived from the same row, so a status can never be one
 * colour on the pill and another on the stripe.
 */
const MATCH_STATUS: Record<string, { pill: StatusKey; accent: string }> = {
  matched:     { pill: 'matched',   accent: 'border-l-success' },
  approved:    { pill: 'approved',  accent: 'border-l-info' },
  pending:     { pill: 'pending',   accent: 'border-l-warning' },
  discrepancy: { pill: 'error',     accent: 'border-l-error' },
  unmatched:   { pill: 'unmatched', accent: 'border-l-warning' },
  flagged:     { pill: 'review',    accent: 'border-l-warning' },
};

const STATUS_LABELS: Record<string, string> = {
  matched: 'Matched',
  approved: 'Approved',
  pending: 'Pending',
  discrepancy: 'Discrepancy',
  unmatched: 'Unmatched',
  flagged: 'Flagged',
};

/**
 * Confidence bands. Three, not the old four: the 50–74 band was `orange-600`,
 * which has no token and no contrast guarantee. Collapsing it into the error
 * band keeps every band inside a verified 4.5:1 pair.
 */
function confidenceTone(score: number): 'success' | 'warning' | 'error' {
  if (score >= 95) return 'success';
  if (score >= 75) return 'warning';
  return 'error';
}

function fmt(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface MatchRowProps {
  match: any;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onFlag: (reason: string) => void;
  onAddNote: (note: string) => void;
  onResolveDiscrepancy: (resolution: string, amount: number | null, notes: string) => void;
  onSearchQB: () => void;
  onUndoApproval: () => void;
  onCreateInQB: () => void;
  onUpdateQBTransaction: (qbTxnId: string, fields: { txnDate?: string; docNumber?: string; memo?: string }) => Promise<any>;
}

export default function MatchRow({
  match,
  isSelected,
  onSelect,
  onApprove,
  onFlag,
  onAddNote,
  onResolveDiscrepancy,
  onSearchQB,
  onUndoApproval,
  onCreateInQB,
  onUpdateQBTransaction,
}: MatchRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFlagMenu, setShowFlagMenu] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showResolvePanel, setShowResolvePanel] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [noteText, setNoteText] = useState(match.notes || '');
  const [isCreatingInQB, setIsCreatingInQB] = useState(false);

  const { check, qb_txn, status, confidence_score, confidence_reasons,
    discrepancy_amount, notes, flagged_reason } = match;

  const mapped = MATCH_STATUS[status] || MATCH_STATUS.pending;

  async function handleCreateInQB() {
    if (!window.confirm('Create this check as a new transaction in QuickBooks?')) return;
    setIsCreatingInQB(true);
    try { await onCreateInQB(); } finally { setIsCreatingInQB(false); }
  }

  return (
    <GlassPanel
      padding="none"
      radius="tile"
      className={cn(
        'mb-2 overflow-hidden border-l-4',
        mapped.accent,
        /* Selected gets denser, never lighter, and never moves the text. */
        isSelected && 'bg-brand/[0.06] shadow-glass-selected'
      )}
      data-selected={isSelected ? '' : undefined}
    >
      {/*
        Main row. The five-column template and the row height are unchanged from
        pre-redesign at `lg` and up, which is every desktop width this product is
        read at.

        Below `lg` it collapses to checkbox + one stacked column. The old fixed
        template needed 534px and simply overflowed its own `overflow-hidden`
        container at 400px — the QuickBooks side and EVERY row action were
        clipped out of reach, with no horizontal scrollbar to find them.
      */}
      <div
        className={cn(
          'grid items-center gap-3',
          'grid-cols-[32px_minmax(0,1fr)]',
          'lg:grid-cols-[32px_1fr_120px_1fr_180px]',
          ROW_CELL
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          aria-label="Select match"
          className="h-4 w-4 rounded border-glass-hairline accent-primary"
        />

        {/* Left: the extracted check */}
        <div className="flex flex-col gap-0.5">
          <div className="text-eyebrow text-ink-faint">Check</div>
          {check ? (
            <>
              <div className="flex items-center gap-2">
                {status === 'approved' && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                <span className="nums text-sm font-semibold text-ink-strong">#{check.check_number || '—'}</span>
                <span className="nums-money text-sm font-semibold text-ink-strong">{fmt(check.amount)}</span>
              </div>
              <div className="nums text-xs text-ink-faint">{fmtDate(check.check_date)}</div>
              <div className="text-xs font-medium text-ink-body">
                {check.payee || <em className="text-ink-faint">No payee</em>}
              </div>
              {check.memo && <div className="text-[11px] italic text-ink-faint">&quot;{check.memo}&quot;</div>}
            </>
          ) : (
            <div className="text-xs text-ink-faint">No check data</div>
          )}
        </div>

        {/* Centre: confidence, then the status it produced */}
        <div className="col-start-2 flex flex-row items-center gap-2 lg:col-start-auto lg:flex-col lg:gap-1">
          <Badge tone={confidenceTone(confidence_score)} size="md" className="nums font-bold">
            {Math.round(confidence_score)}%
          </Badge>
          <span aria-hidden className="text-sm text-ink-faint">→</span>
          <StatusPill status={mapped.pill} label={STATUS_LABELS[status] || status} size="sm" />
        </div>

        {/* Right: the QuickBooks transaction */}
        <div className="col-start-2 flex flex-col gap-0.5 lg:col-start-auto">
          <div className="text-eyebrow text-ink-faint">QuickBooks</div>
          {qb_txn ? (
            <>
              <div className="flex items-center gap-2">
                <span className="nums text-sm font-semibold text-ink-strong">
                  {qb_txn.doc_number ? `#${qb_txn.doc_number}` : qb_txn.txn_type || 'Txn'}
                </span>
                <span
                  className={cn(
                    'nums-money text-sm font-semibold',
                    discrepancy_amount > 0 ? 'text-error-text' : 'text-ink-strong'
                  )}
                >
                  {fmt(qb_txn.amount)}
                </span>
              </div>
              <div className="nums text-xs text-ink-faint">{fmtDate(qb_txn.txn_date)}</div>
              <div className="text-xs font-medium text-ink-body">
                {qb_txn.payee || <em className="text-ink-faint">No payee</em>}
              </div>
              {qb_txn.account && <div className="text-[11px] text-ink-faint">{qb_txn.account}</div>}
              {discrepancy_amount > 0 && (
                <div className="nums text-[11px] font-semibold text-error-text">
                  Δ {fmt(discrepancy_amount)} difference
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-start gap-1 py-1">
              <HelpCircle className="h-5 w-5 text-ink-faint" aria-hidden />
              <span className="text-xs text-ink-body">No QB match found</span>
            </div>
          )}
        </div>

        {/* Row actions */}
        <div className="col-start-2 flex flex-row flex-wrap items-center gap-1.5 lg:col-start-auto lg:flex-col lg:items-end">
          {status === 'unmatched' && (
            <>
              <button type="button" className={ROW_BTN_PRIMARY} onClick={onSearchQB}>
                <Search className="h-3 w-3" aria-hidden /> Find in QB
              </button>
              <button type="button" className={ROW_BTN_QUIET} disabled={isCreatingInQB} onClick={handleCreateInQB}>
                <Plus className="h-3 w-3" aria-hidden /> {isCreatingInQB ? 'Creating…' : 'Create in QB'}
              </button>
            </>
          )}
          {['matched', 'pending'].includes(status) && (
            <>
              <button type="button" className={ROW_BTN_PRIMARY} onClick={onApprove}>
                <Check className="h-3 w-3" aria-hidden /> Approve
              </button>
              <button type="button" className={ROW_BTN_QUIET} onClick={onSearchQB}>
                <Repeat className="h-3 w-3" aria-hidden /> Remap
              </button>
            </>
          )}
          {status === 'discrepancy' && (
            <>
              <button
                type="button"
                className={ROW_BTN_PRIMARY}
                onClick={() => setShowResolvePanel((v) => !v)}
                aria-expanded={showResolvePanel}
              >
                <AlertTriangle className="h-3 w-3" aria-hidden /> Resolve
              </button>
              <button type="button" className={ROW_BTN_QUIET} onClick={onSearchQB}>
                <Repeat className="h-3 w-3" aria-hidden /> Remap
              </button>
            </>
          )}
          {status === 'approved' && (
            <>
              <StatusPill
                status="approved"
                label="Approved"
                size="md"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              />
              <button type="button" className={ROW_BTN_QUIET} onClick={onUndoApproval}>
                <Undo2 className="h-3 w-3" aria-hidden /> Undo
              </button>
            </>
          )}
          {status === 'flagged' && (
            <>
              <button type="button" className={ROW_BTN_PRIMARY} onClick={onApprove}>
                <Check className="h-3 w-3" aria-hidden /> Approve Anyway
              </button>
              <Badge tone="warning" size="sm" className="max-w-[170px] text-right">
                <Flag className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{flagged_reason || 'Flagged for review'}</span>
              </Badge>
            </>
          )}

          {/* Universal affordances, available on every status */}
          <div className="mt-0.5 flex gap-1">
            {status !== 'flagged' && (
              <button
                type="button"
                onClick={() => setShowFlagMenu((v) => !v)}
                aria-expanded={showFlagMenu}
                aria-label="Flag for review"
                title="Flag"
                className="press rounded-input border border-glass-hairline p-1 text-ink-faint hover:text-warning-text"
              >
                <Flag className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNoteInput((v) => !v)}
              aria-expanded={showNoteInput}
              aria-label="Internal note"
              title="Note"
              className="press rounded-input border border-glass-hairline p-1 text-ink-faint hover:text-brand-deep"
            >
              <FileText className="h-3 w-3" />
            </button>
            {qb_txn && (
              <button
                type="button"
                onClick={() => setShowEditPanel((v) => !v)}
                aria-expanded={showEditPanel}
                aria-label="Edit QB transaction"
                title="Edit QB transaction"
                className="press rounded-input border border-glass-hairline p-1 text-ink-faint hover:text-success-text"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label="Confidence breakdown"
              title="Details"
              className="press rounded-input border border-glass-hairline p-1 text-ink-faint hover:text-ink-strong"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>

      {showFlagMenu && (
        <FlagMenu
          onFlag={(reason) => { onFlag(reason); setShowFlagMenu(false); }}
          onClose={() => setShowFlagMenu(false)}
        />
      )}

      {showNoteInput && (
        <SubPanel title="Internal note">
          <Field
            htmlFor={`note-${match.id}`}
            hint="Visible only to your firm."
          >
            <Textarea
              id={`note-${match.id}`}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note visible only to your firm…"
              rows={3}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={ROW_BTN_PRIMARY}
              onClick={() => { onAddNote(noteText); setShowNoteInput(false); }}
            >
              Save note
            </button>
            <button type="button" className={ROW_BTN_QUIET} onClick={() => setShowNoteInput(false)}>
              Cancel
            </button>
          </div>
        </SubPanel>
      )}

      {showResolvePanel && (
        <ResolvePanel
          match={match}
          onResolve={(resolution, amount, resolveNotes) => { onResolveDiscrepancy(resolution, amount, resolveNotes); setShowResolvePanel(false); }}
          onClose={() => setShowResolvePanel(false)}
        />
      )}

      {showEditPanel && qb_txn && (
        <EditQBPanel
          qbTxn={qb_txn}
          onSave={async (fields) => {
            await onUpdateQBTransaction(qb_txn.id, fields);
            setShowEditPanel(false);
          }}
          onClose={() => setShowEditPanel(false)}
        />
      )}

      {expanded && confidence_reasons && (
        <SubPanel title="Match confidence breakdown" eyebrow>
          <div className="flex flex-col gap-2">
            <ScoreBar label="Amount" score={confidence_reasons.amount} max={40} />
            <ScoreBar label="Check #" score={confidence_reasons.checkNumber} max={30} />
            <ScoreBar label="Date" score={confidence_reasons.date} max={15} />
            <ScoreBar label="Payee" score={confidence_reasons.payee} max={15} />
          </div>
          {notes && (
            <div className="mt-3 border-t border-glass-hairline pt-2 text-xs text-ink-body">
              <em>{notes}</em>
            </div>
          )}
        </SubPanel>
      )}
    </GlassPanel>
  );
}

/**
 * The expanded drawers. One recipe, so the four of them cannot drift. `sunken`
 * carries no backdrop-filter — this sits inside a row that sits inside a list.
 */
function SubPanel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('border-t border-glass-hairline bg-surface-sunken/70', PANEL_CELL)}>
      <div className={cn('mb-2', eyebrow ? 'text-eyebrow text-ink-faint' : 'text-xs font-semibold text-ink-body')}>
        {title}
      </div>
      {children}
    </div>
  );
}

function FlagMenu({ onFlag, onClose }: { onFlag: (reason: string) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const presets = [
    'Amount mismatch needs review',
    'Wrong payee',
    'Duplicate suspected',
    'Date discrepancy',
    'Missing documentation',
    'Client needs to confirm',
  ];
  return (
    <SubPanel title="Flag for review">
      <div className="flex flex-col gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onFlag(p)}
            className="press rounded-input border border-glass-hairline bg-surface/70 px-3 py-1.5 text-left text-xs text-ink-body hover:bg-brand/[0.06] hover:text-ink-strong"
          >
            {p}
          </button>
        ))}
        <Input
          inputSize="sm"
          placeholder="Custom reason…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && custom && onFlag(custom)}
        />
      </div>
      <div className="mt-2 flex gap-2">
        {custom && (
          <button type="button" className={ROW_BTN_PRIMARY} onClick={() => onFlag(custom)}>
            Flag: &quot;{custom}&quot;
          </button>
        )}
        <button type="button" className={ROW_BTN_QUIET} onClick={onClose}>
          Cancel
        </button>
      </div>
    </SubPanel>
  );
}

function ResolvePanel({ match, onResolve, onClose }: {
  match: any;
  onResolve: (resolution: string, amount: number | null, notes: string) => void;
  onClose: () => void;
}) {
  const [resolution, setResolution] = useState('use_check_amount');
  const [notes, setNotes] = useState('');

  const checkAmt = match.check?.amount;
  const qbAmt = match.qb_txn?.amount;

  return (
    <SubPanel title="Resolve discrepancy">
      <div className="mb-3 text-xs text-ink-body">
        Check <strong className="nums">{fmt(checkAmt)}</strong> · QB{' '}
        <strong className="nums">{fmt(qbAmt)}</strong> · Difference{' '}
        <strong className="nums text-error-text">{fmt(Math.abs((checkAmt || 0) - (qbAmt || 0)))}</strong>
      </div>
      <div className="mb-3 flex flex-col gap-2">
        {[
          { value: 'use_check_amount', label: `Use check amount (${fmt(checkAmt)}) — update QB` },
          { value: 'use_qb_amount', label: `Use QB amount (${fmt(qbAmt)}) — accept as-is` },
          { value: 'manual_override', label: "Manual override — I'll enter the correct amount" },
        ].map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-xs text-ink-body">
            <input
              type="radio"
              name={`resolution-${match.id}`}
              value={opt.value}
              checked={resolution === opt.value}
              onChange={() => setResolution(opt.value)}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <Textarea
        placeholder="Resolution notes (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        aria-label="Resolution notes"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={ROW_BTN_PRIMARY}
          onClick={() => onResolve(resolution, null, notes)}
        >
          Resolve &amp; approve
        </button>
        <button type="button" className={ROW_BTN_QUIET} onClick={onClose}>
          Cancel
        </button>
      </div>
    </SubPanel>
  );
}

function EditQBPanel({
  qbTxn,
  onSave,
  onClose,
}: {
  qbTxn: any;
  onSave: (fields: { txnDate?: string; docNumber?: string; memo?: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [txnDate, setTxnDate] = useState<string>(qbTxn.txn_date?.split('T')[0] || '');
  const [docNumber, setDocNumber] = useState<string>(qbTxn.doc_number || '');
  const [memo, setMemo] = useState<string>(qbTxn.memo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    const fields: { txnDate?: string; docNumber?: string; memo?: string } = {};
    if (txnDate && txnDate !== qbTxn.txn_date?.split('T')[0]) fields.txnDate = txnDate;
    if (docNumber !== (qbTxn.doc_number || '')) fields.docNumber = docNumber;
    if (memo !== (qbTxn.memo || '')) fields.memo = memo;
    if (!Object.keys(fields).length) { onClose(); return; }
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(fields);
    } catch (e: any) {
      setSaveError(e.message || 'Failed to update');
      setIsSaving(false);
    }
  }

  return (
    <SubPanel title="Edit QB transaction">
      <p className="mb-3 text-[11px] text-ink-faint">
        Updates date, check # and memo directly in QuickBooks.
      </p>
      <div className="mb-3 flex flex-col gap-2">
        <Field label="Date" htmlFor={`qb-date-${qbTxn.id}`}>
          <Input
            id={`qb-date-${qbTxn.id}`}
            inputSize="sm"
            type="date"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
          />
        </Field>
        <Field label="Check # / Ref no." htmlFor={`qb-doc-${qbTxn.id}`}>
          <Input
            id={`qb-doc-${qbTxn.id}`}
            inputSize="sm"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder={qbTxn.doc_number || 'e.g. 800001'}
          />
        </Field>
        <Field label="Memo" htmlFor={`qb-memo-${qbTxn.id}`}>
          <Input
            id={`qb-memo-${qbTxn.id}`}
            inputSize="sm"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={qbTxn.memo || 'Add memo…'}
          />
        </Field>
      </div>
      {saveError && (
        <p role="alert" className="mb-2 rounded-input bg-error-bg px-2 py-1 text-xs text-error-text">
          {saveError}
        </p>
      )}
      <p className="mb-2 text-[11px] text-ink-faint">
        Amount and payee changes require editing directly in QuickBooks.
      </p>
      <div className="flex gap-2">
        <button type="button" className={ROW_BTN_PRIMARY} onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save to QB'}
        </button>
        <button type="button" className={ROW_BTN_QUIET} onClick={onClose}>
          Cancel
        </button>
      </div>
    </SubPanel>
  );
}

/**
 * The one inline `style` left in this file, and it has to be: the bar width is
 * `score / max` and no utility can express an arbitrary percentage. The colour
 * beside it is NOT inline — it is a token class, which is the half of this
 * component that used to drift.
 */
function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;
  const fill = pct === 100 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-error';
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-xs font-medium text-ink-body">{label}</div>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken shadow-inner-track"
        role="meter"
        aria-label={`${label} score`}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-settle ease-settle', fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="nums w-10 text-right text-[11px] text-ink-faint">
        {score}/{max}
      </div>
    </div>
  );
}
