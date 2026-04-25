'use client';

import { useState } from 'react';
import { Check, Flag, FileText, ChevronDown, ChevronUp, Search, Plus, Undo2, AlertTriangle, Pencil } from 'lucide-react';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  matched:     { bg: 'bg-emerald-50', text: 'text-emerald-800', dot: 'bg-emerald-500', border: 'border-emerald-500' },
  approved:    { bg: 'bg-blue-50',    text: 'text-blue-800',    dot: 'bg-blue-500',    border: 'border-blue-500' },
  pending:     { bg: 'bg-amber-50',   text: 'text-amber-800',   dot: 'bg-amber-500',   border: 'border-amber-500' },
  discrepancy: { bg: 'bg-red-50',     text: 'text-red-800',     dot: 'bg-red-500',     border: 'border-red-500' },
  unmatched:   { bg: 'bg-gray-50',    text: 'text-gray-700',    dot: 'bg-gray-400',    border: 'border-gray-400' },
  flagged:     { bg: 'bg-violet-50',  text: 'text-violet-800',  dot: 'bg-violet-500',  border: 'border-violet-500' },
};

const STATUS_LABELS: Record<string, string> = {
  matched: 'Matched',
  approved: 'Approved',
  pending: 'Pending',
  discrepancy: 'Discrepancy',
  unmatched: 'Unmatched',
  flagged: 'Flagged',
};

function confidenceColor(score: number): string {
  if (score >= 95) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (score >= 75) return 'text-amber-600 bg-amber-50 border-amber-200';
  if (score >= 50) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-red-600 bg-red-50 border-red-200';
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

  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;

  async function handleCreateInQB() {
    if (!window.confirm('Create this check as a new transaction in QuickBooks?')) return;
    setIsCreatingInQB(true);
    try { await onCreateInQB(); } finally { setIsCreatingInQB(false); }
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-2 border-l-4 ${colors.border} ${isSelected ? 'ring-2 ring-indigo-200' : ''}`}>
      {/* Main row */}
      <div className="grid grid-cols-[32px_1fr_120px_1fr_180px] gap-3 px-4 py-3 items-center">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />

        {/* Left: Check data */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Check</div>
          {check ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">#{check.check_number || '—'}</span>
                <span className="text-sm font-bold text-gray-900">{fmt(check.amount)}</span>
              </div>
              <div className="text-xs text-gray-500">{fmtDate(check.check_date)}</div>
              <div className="text-xs font-medium text-gray-700">{check.payee || <em className="text-gray-400">No payee</em>}</div>
              {check.memo && <div className="text-[11px] text-gray-400 italic">&quot;{check.memo}&quot;</div>}
            </>
          ) : (
            <div className="text-xs text-gray-400">No check data</div>
          )}
        </div>

        {/* Center: Confidence */}
        <div className="flex flex-col items-center gap-1">
          <span className={`text-sm font-extrabold px-2.5 py-0.5 rounded-full border ${confidenceColor(confidence_score)}`}>
            {Math.round(confidence_score)}%
          </span>
          <span className="text-gray-300 text-sm">→</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
            {STATUS_LABELS[status] || status}
          </span>
        </div>

        {/* Right: QB transaction */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">QuickBooks</div>
          {qb_txn ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">
                  {qb_txn.doc_number ? `#${qb_txn.doc_number}` : qb_txn.txn_type || 'Txn'}
                </span>
                <span className={`text-sm font-bold ${discrepancy_amount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {fmt(qb_txn.amount)}
                </span>
              </div>
              <div className="text-xs text-gray-500">{fmtDate(qb_txn.txn_date)}</div>
              <div className="text-xs font-medium text-gray-700">{qb_txn.payee || <em className="text-gray-400">No payee</em>}</div>
              {qb_txn.account && <div className="text-[11px] text-gray-400">{qb_txn.account}</div>}
              {discrepancy_amount > 0 && (
                <div className="text-[11px] text-red-600 font-semibold">Δ {fmt(discrepancy_amount)} difference</div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-start py-1">
              <span className="text-lg">❓</span>
              <span className="text-xs text-gray-500">No QB match found</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 items-end">
          {status === 'unmatched' && (
            <>
              <button onClick={onSearchQB} className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-1">
                <Search className="w-3 h-3" /> Find in QB
              </button>
              <button onClick={handleCreateInQB} disabled={isCreatingInQB} className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1">
                <Plus className="w-3 h-3" /> {isCreatingInQB ? '…' : 'Create in QB'}
              </button>
            </>
          )}
          {['matched', 'pending'].includes(status) && (
            <>
              <button onClick={onApprove} className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors flex items-center gap-1">
                <Check className="w-3 h-3" /> Approve
              </button>
              <button onClick={onSearchQB} className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1">
                🔁 Remap
              </button>
            </>
          )}
          {status === 'discrepancy' && (
            <>
              <button onClick={() => setShowResolvePanel((v) => !v)} className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Resolve
              </button>
              <button onClick={onSearchQB} className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1">
                🔁 Remap
              </button>
            </>
          )}
          {status === 'approved' && (
            <button onClick={onUndoApproval} className="px-2.5 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1">
              <Undo2 className="w-3 h-3" /> Undo
            </button>
          )}
          {status === 'flagged' && (
            <>
              <button onClick={onApprove} className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors flex items-center gap-1">
                <Check className="w-3 h-3" /> Approve Anyway
              </button>
              <div className="text-[11px] text-violet-600 italic bg-violet-50 px-2 py-0.5 rounded">
                🚩 {flagged_reason || 'Flagged for review'}
              </div>
            </>
          )}
          {/* Universal icons */}
          <div className="flex gap-1 mt-0.5">
            {status !== 'flagged' && (
              <button onClick={() => setShowFlagMenu((v) => !v)} title="Flag" className="p-1 text-gray-400 hover:text-violet-600 border border-gray-200 rounded transition-colors">
                <Flag className="w-3 h-3" />
              </button>
            )}
            <button onClick={() => setShowNoteInput((v) => !v)} title="Note" className="p-1 text-gray-400 hover:text-indigo-600 border border-gray-200 rounded transition-colors">
              <FileText className="w-3 h-3" />
            </button>
            {qb_txn && (
              <button onClick={() => setShowEditPanel((v) => !v)} title="Edit QB transaction" className="p-1 text-gray-400 hover:text-emerald-600 border border-gray-200 rounded transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <button onClick={() => setExpanded((v) => !v)} title="Details" className="p-1 text-gray-400 hover:text-gray-600 border border-gray-200 rounded transition-colors">
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Flag menu panel */}
      {showFlagMenu && (
        <FlagMenu
          onFlag={(reason) => { onFlag(reason); setShowFlagMenu(false); }}
          onClose={() => setShowFlagMenu(false)}
        />
      )}

      {/* Note input panel */}
      {showNoteInput && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <div className="text-xs font-bold text-gray-700 mb-2">Internal Note</div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note visible only to your firm…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
            rows={3}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onAddNote(noteText); setShowNoteInput(false); }} className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
              Save Note
            </button>
            <button onClick={() => setShowNoteInput(false)} className="px-3 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolve discrepancy panel */}
      {showResolvePanel && (
        <ResolvePanel
          match={match}
          onResolve={(resolution, amount, notes) => { onResolveDiscrepancy(resolution, amount, notes); setShowResolvePanel(false); }}
          onClose={() => setShowResolvePanel(false)}
        />
      )}

      {/* Edit QB transaction panel */}
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

      {/* Confidence breakdown */}
      {expanded && confidence_reasons && (
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">Match Confidence Breakdown</div>
          <div className="flex flex-col gap-2">
            <ScoreBar label="Amount" score={confidence_reasons.amount} max={40} />
            <ScoreBar label="Check #" score={confidence_reasons.checkNumber} max={30} />
            <ScoreBar label="Date" score={confidence_reasons.date} max={15} />
            <ScoreBar label="Payee" score={confidence_reasons.payee} max={15} />
          </div>
          {notes && (
            <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-500">
              📝 <em>{notes}</em>
            </div>
          )}
        </div>
      )}
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
    <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
      <div className="text-xs font-bold text-gray-700 mb-2">🚩 Flag for Review</div>
      <div className="flex flex-col gap-1.5">
        {presets.map((p) => (
          <button key={p} onClick={() => onFlag(p)} className="text-left text-xs text-gray-700 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
            {p}
          </button>
        ))}
        <input
          placeholder="Custom reason…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200"
          onKeyDown={(e) => e.key === 'Enter' && custom && onFlag(custom)}
        />
      </div>
      <div className="flex gap-2 mt-2">
        {custom && (
          <button onClick={() => onFlag(custom)} className="px-3 py-1 text-xs font-semibold bg-violet-600 text-white rounded-md hover:bg-violet-700">
            Flag: &quot;{custom}&quot;
          </button>
        )}
        <button onClick={onClose} className="px-3 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
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
    <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
      <div className="text-xs font-bold text-gray-700 mb-2">⚠️ Resolve Discrepancy</div>
      <div className="text-xs text-gray-600 mb-3">
        Check: <strong>{fmt(checkAmt)}</strong> | QB: <strong>{fmt(qbAmt)}</strong> | Diff:{' '}
        <strong className="text-red-600">{fmt(Math.abs((checkAmt || 0) - (qbAmt || 0)))}</strong>
      </div>
      <div className="flex flex-col gap-2 mb-3">
        {[
          { value: 'use_check_amount', label: `Use check amount (${fmt(checkAmt)}) — update QB` },
          { value: 'use_qb_amount', label: `Use QB amount (${fmt(qbAmt)}) — accept as-is` },
          { value: 'manual_override', label: "Manual override — I'll enter the correct amount" },
        ].map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="radio"
              value={opt.value}
              checked={resolution === opt.value}
              onChange={() => setResolution(opt.value)}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <textarea
        placeholder="Resolution notes (optional)…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
        rows={2}
      />
      <div className="flex gap-2 mt-2">
        <button onClick={() => onResolve(resolution, null, notes)} className="px-3 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700">
          Resolve & Approve
        </button>
        <button onClick={onClose} className="px-3 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
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
    <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
      <div className="text-xs font-bold text-gray-700 mb-3">✏️ Edit QB Transaction</div>
      <div className="text-[11px] text-gray-500 mb-3">Updates date, check #, and memo directly in QuickBooks.</div>
      <div className="flex flex-col gap-2 mb-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Date</span>
          <input
            type="date"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Check # / Ref No.</span>
          <input
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder={qbTxn.doc_number || 'e.g. 800001'}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Memo</span>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={qbTxn.memo || 'Add memo…'}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>
      </div>
      {saveError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">{saveError}</div>
      )}
      <div className="text-[10px] text-gray-400 mb-2">Amount and payee changes require editing directly in QuickBooks.</div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-3 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save to QB'}
        </button>
        <button onClick={onClose} className="px-3 py-1 text-xs font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color = pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-xs text-gray-700 font-medium">{label}</div>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-[11px] text-gray-400">
        {score}/{max}
      </div>
    </div>
  );
}
