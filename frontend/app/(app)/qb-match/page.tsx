'use client';

import { useState, Suspense } from 'react';
import { useMatches } from '@/hooks/useMatches';
import { useQBConnections } from '@/hooks/useQBConnections';
import MatchRow from '@/components/MatchRow';
import SearchQBModal from '@/components/SearchQBModal';
import {
  RefreshCw, Search, Check, AlertTriangle, Flag, Clock, HelpCircle,
  Loader2, CheckCircle2, Filter, ArrowUpDown, Building2,
} from 'lucide-react';
import { QBCompanySwitcher } from '@/components/QBCompanySwitcher';
import { Button, GlassCard, Select, Skeleton, Tabs } from '@/components/ui';

/**
 * QB Match.
 *
 * CHECKLIST section 3 removes this as a separate route: it merges with QB
 * Comparisons into the Review step's three tabs. That merge spans files this
 * parcel does not own, so nothing is deleted here — the surface is restyled so
 * it can be lifted across intact, and every row action it provides is listed
 * in the parcel-H report so the merge can be checked against it.
 *
 * Blur budget: ZERO blurred surfaces are declared in this file. The toolbar is
 * a GlassCard, the status tabs are the Tabs primitive (one thumb), and every
 * match row is a GlassPanel, which carries no backdrop-filter. The count does
 * not move when the list grows from 1 row to 428.
 */

const STATUS_TABS = [
  { value: 'all',         label: 'All',         icon: <Filter className="h-3.5 w-3.5" /> },
  { value: 'pending',     label: 'Pending',     icon: <Clock className="h-3.5 w-3.5" /> },
  { value: 'matched',     label: 'Matched',     icon: <Check className="h-3.5 w-3.5" /> },
  { value: 'discrepancy', label: 'Discrepancy', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { value: 'unmatched',   label: 'Unmatched',   icon: <HelpCircle className="h-3.5 w-3.5" /> },
  { value: 'flagged',     label: 'Flagged',     icon: <Flag className="h-3.5 w-3.5" /> },
  { value: 'approved',    label: 'Approved',    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
];

const SORT_OPTIONS = [
  { key: 'confidence', label: 'Confidence (low first)' },
  { key: 'date',       label: 'Most Recent' },
  { key: 'amount',     label: 'Largest Discrepancy' },
];

function QBMatchPageContent() {
  const { hasConnections, isLoading: qbLoading } = useQBConnections();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchModal, setSearchModal] = useState<{ check: any; matchId: string } | null>(null);

  const {
    matches, statusCounts, isLoading, isSyncing, error,
    refresh, syncQB, approveSingle, bulkApprove, flagMatch,
    addNote, resolveDiscrepancy, remapMatch, undoApproval, createInQB, updateQBTransaction,
  } = useMatches({ status: statusFilter, search: searchQuery, sort: sortBy });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === matches.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(matches.map((m: any) => m.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) {
      await bulkApprove({ minConfidence: 95 });
    } else {
      await bulkApprove({ matchIds: Array.from(selected) });
    }
    setSelected(new Set());
  };

  const handleRemapSelect = async (qbTxn: any) => {
    if (!searchModal) return;
    await remapMatch(searchModal.matchId, qbTxn.id);
    setSearchModal(null);
  };

  if (!qbLoading && !hasConnections) {
    return (
      <div className="mx-auto max-w-7xl p-5" data-tone="brand">
        <GlassCard padding="lg" className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="mb-4 h-12 w-12 text-ink-faint" aria-hidden />
          <h2 className="font-heading text-xl font-semibold text-ink-strong">No QuickBooks connection</h2>
          <p className="mt-2 max-w-md text-sm text-ink-body">
            Connect a QuickBooks company to start matching your extracted checks against QB transactions.
          </p>
          <a href="/settings?tab=integrations" className="mt-5 inline-flex">
            <Button size="sm">Go to settings</Button>
          </a>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5" data-tone="brand">
      {/* ── Header ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink-strong">QB Match</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            Match extracted checks against QuickBooks transactions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QBCompanySwitcher />
          <Button
            size="sm"
            loading={isSyncing}
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={syncQB}
          >
            {isSyncing ? 'Syncing…' : 'Sync QB & match'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Check className="h-4 w-4" />}
            onClick={handleBulkApprove}
          >
            {selected.size > 0 ? `Approve ${selected.size} selected` : 'Auto-approve ≥95%'}
          </Button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* ── Status tabs. One thumb, not one surface per tab. ───────── */}
      <div className="overflow-x-auto pb-1">
        <Tabs
          aria-label="Match status"
          items={STATUS_TABS.map((t) => ({ ...t, count: statusCounts[t.value] || undefined }))}
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setSelected(new Set()); }}
        />
      </div>

      {/* ── Toolbar: search, sort, selection. The one glass container. ───── */}
      <GlassCard padding="sm" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by check #, payee, amount…"
              aria-label="Search matches"
              className="w-full rounded-input border border-glass-hairline bg-white/70 py-2.5 pl-9 pr-4 text-sm text-ink-strong shadow-inner-track placeholder:text-ink-faint focus:border-brand focus:bg-white/90 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-ink-faint" aria-hidden />
            <Select
              inputSize="sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort matches"
              className="w-[220px]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </Select>
          </div>
        </div>

        {matches.length > 0 && (
          <div className="flex items-center gap-3 border-t border-glass-hairline pt-3">
            <input
              type="checkbox"
              checked={selected.size === matches.length && matches.length > 0}
              onChange={selectAll}
              aria-label="Select all matches"
              className="h-4 w-4 rounded border-glass-hairline accent-primary"
            />
            <span className="nums text-xs font-medium text-ink-body">
              {selected.size > 0
                ? `${selected.size} of ${matches.length} selected`
                : `${matches.length} match${matches.length !== 1 ? 'es' : ''}`}
            </span>
            <button
              type="button"
              onClick={refresh}
              className="press ml-auto inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-strong"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
            </button>
          </div>
        )}
      </GlassCard>

      {/* ── The list. Every row is a GlassPanel: no blur, no extra layer. ── */}
      {isLoading ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="block" className="h-[92px] w-full" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <GlassCard padding="lg" className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="mb-3 h-10 w-10 text-ink-faint" aria-hidden />
          <p className="font-heading text-base font-semibold text-ink-strong">No matches found</p>
          <p className="mt-1 text-sm text-ink-body">
            {statusFilter !== 'all'
              ? 'Try a different filter.'
              : 'Sync with QuickBooks to start matching.'}
          </p>
        </GlassCard>
      ) : (
        <div>
          {matches.map((match: any) => (
            <MatchRow
              key={match.id}
              match={match}
              isSelected={selected.has(match.id)}
              onSelect={() => toggleSelect(match.id)}
              onApprove={() => approveSingle(match.id)}
              onFlag={(reason) => flagMatch(match.id, reason)}
              onAddNote={(note) => addNote(match.id, note)}
              onResolveDiscrepancy={(resolution, amount, notes) =>
                resolveDiscrepancy(match.id, resolution, amount, notes)
              }
              onSearchQB={() => setSearchModal({ check: match.check, matchId: match.id })}
              onUndoApproval={() => undoApproval(match.id)}
              onCreateInQB={() => createInQB(match.check?.id)}
              onUpdateQBTransaction={(qbTxnId, fields) => updateQBTransaction(qbTxnId, fields)}
            />
          ))}
        </div>
      )}

      {searchModal && (
        <SearchQBModal
          check={searchModal.check}
          onSelect={handleRemapSelect}
          onClose={() => setSearchModal(null)}
        />
      )}
    </div>
  );
}

export default function QBMatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-ink-faint" aria-label="Loading" />
        </div>
      }
    >
      <QBMatchPageContent />
    </Suspense>
  );
}
