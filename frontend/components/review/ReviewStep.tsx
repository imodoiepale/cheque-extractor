'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Search, Check, AlertTriangle, Flag, Clock, HelpCircle,
  CheckCircle2, Filter, ArrowUpDown, Building2, ListChecks, BadgeCheck,
} from 'lucide-react';
import { useMatches } from '@/hooks/useMatches';
import { useQBConnections } from '@/hooks/useQBConnections';
import MatchRow from '@/components/MatchRow';
import SearchQBModal from '@/components/SearchQBModal';
import SideBySideModal from '@/components/review/SideBySideModal';
import { QBCompanySwitcher } from '@/components/QBCompanySwitcher';
import { Button, GlassCard, GlassPanel, Select, Skeleton, Tabs } from '@/components/ui';
import { Pagination } from '@/app/(app)/qb-comparisons/components/Pagination';
import { NEEDS_ATTENTION_STATUSES } from '@/lib/batch-state';
import { cn } from '@/lib/utils';

/**
 * The Review step — CHECKLIST section 3.
 *
 * QB Match and QB Comparisons collapse into ONE surface with three tabs:
 * Needs Attention · 100% Matches · All Checks. Michael's note was "I would like
 * to get rid of the Excel look": the spreadsheet feel goes, the capability does
 * not. All 24 catalogued match capabilities are still here — the page-level ten
 * in this file, the row-level fourteen in MatchRow, which is rendered unchanged
 * precisely so none of them can be lost in the move.
 *
 * Four rules this file is held to by scripts/check-review-step.ts:
 *
 *  1. "Needs Attention" is NEEDS_ATTENTION_STATUSES imported from
 *     lib/batch-state.ts — never a list retyped here. The stepper marks step 3
 *     complete when counts.needs_attention hits 0; if this tab's definition
 *     drifted, the stepper and the tab would disagree about whether the user is
 *     finished. Three copies of that set (SQL, batch-state, this tab) are
 *     asserted equal.
 *  2. The seven status filters are NOT lost. Each tab carries the subset of
 *     statuses it contains as a chip row with live counts, so every one of the
 *     seven is still one click away and still shows its own count.
 *  3. The up-to-200-record view stays. Pagination is the comparison grid's own
 *     component, whose PER_PAGE list already includes 200 — reused rather than
 *     retyped, so trimming the options is a one-place change that the check
 *     catches.
 *  4. Blur budget is a CONSTANT, not a function of the row count. Exactly three
 *     blurred surfaces are declared here (the toolbar GlassCard, the empty/
 *     no-connection GlassCard, and the Tabs thumb, which the primitive owns),
 *     and none of them is inside the row loop. Rows are GlassPanels, which
 *     carry no backdrop-filter.
 *
 * No Excel look: no <table>, so no border-collapse and no per-cell vertical
 * rules to remove; no zebra striping; group structure is carried by hairlines
 * between sections; row state is a tint plus a constant-width accent and an
 * inset shadow on selection, so text never shifts. That is the same doctrine
 * ComparisonTable follows.
 *
 * Density: row height is NOT this file's to set. MatchRow declares ROW_CELL =
 * 'px-4 py-3' once, measured before the redesign and unchanged, and nothing
 * here pads it back up. The shared Td py-3/text-sm recipe is deliberately not
 * adopted — this surface is not a table and would gain nothing from it.
 */

/** Every status the match engine emits. The three tabs must cover all of them. */
const ALL_STATUSES = [
  'pending',
  'matched',
  'discrepancy',
  'unmatched',
  'flagged',
  'approved',
] as const;

/** The settled set. "100% Matches" is the confidently-matched rows plus the
 *  ones already signed off, so Approved stays one click from the matched view
 *  instead of only being reachable through All Checks. */
const SETTLED_STATUSES = ['matched', 'approved'] as const;

const STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  all:         { label: 'All',         icon: <Filter className="h-3.5 w-3.5" /> },
  pending:     { label: 'Pending',     icon: <Clock className="h-3.5 w-3.5" /> },
  matched:     { label: 'Matched',     icon: <Check className="h-3.5 w-3.5" /> },
  discrepancy: { label: 'Discrepancy', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  unmatched:   { label: 'Unmatched',   icon: <HelpCircle className="h-3.5 w-3.5" /> },
  flagged:     { label: 'Flagged',     icon: <Flag className="h-3.5 w-3.5" /> },
  approved:    { label: 'Approved',    icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

/**
 * The three tabs, and the mapping onto the seven old status filters.
 *
 *   attention  →  pending · flagged · discrepancy · unmatched   (NEEDS_ATTENTION_STATUSES)
 *   settled    →  matched · approved
 *   all        →  All + every one of the six, individually
 */
const REVIEW_TABS = [
  {
    value: 'attention',
    label: 'Needs Attention',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    statuses: [...NEEDS_ATTENTION_STATUSES] as string[],
    /** No "All" chip: the tab itself already IS the union. */
    chips: [...NEEDS_ATTENTION_STATUSES] as string[],
    empty: 'Nothing needs attention. This step is complete.',
  },
  {
    value: 'settled',
    label: '100% Matches',
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
    statuses: [...SETTLED_STATUSES] as string[],
    chips: [...SETTLED_STATUSES] as string[],
    empty: 'No confident matches yet. Sync QuickBooks to match against.',
  },
  {
    value: 'all',
    label: 'All Checks',
    icon: <ListChecks className="h-3.5 w-3.5" />,
    statuses: [] as string[],
    chips: ['all', ...ALL_STATUSES] as string[],
    empty: 'No cheques here yet. Sync with QuickBooks to start matching.',
  },
] as const;

/**
 * The auto-approve confidence threshold — the one control that survived the
 * removal of the Settings matching-preferences panel (CHECKLIST section 3).
 * It lives here, beside the Approve All button that is the only thing that
 * reads it. Per-user and per-browser, so no migration and no new API surface.
 */
const THRESHOLD_KEY = 'kyriq.autoApproveMinConfidence';
const THRESHOLD_OPTIONS = [80, 85, 90, 95, 98, 100] as const;
const THRESHOLD_DEFAULT = 95;

const SORT_OPTIONS = [
  { key: 'confidence', label: 'Confidence (low first)' },
  { key: 'date',       label: 'Most Recent' },
  { key: 'amount',     label: 'Largest Discrepancy' },
];

/**
 * Status chip. NOT the Button primitive: `secondary` is `.glass-card` and
 * `ghost` carries `backdrop-blur-[8px]`, and these sit directly above a list
 * that runs to hundreds inside the same scroll container. Same reasoning, and
 * the same local-pill answer, as MatchRow's row buttons.
 */
const CHIP_BASE = [
  'press inline-flex min-h-0 items-center gap-1.5 whitespace-nowrap',
  'rounded-pill border px-2.5 py-1 text-xs font-semibold',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
].join(' ');
const CHIP_ON = `${CHIP_BASE} border-brand/30 bg-brand/[0.10] text-brand-deep`;
const CHIP_OFF = `${CHIP_BASE} border-glass-hairline bg-surface/70 text-ink-body hover:bg-brand/[0.06] hover:text-ink-strong`;

export interface ReviewStepProps {
  /** Shown above the tabs. The stepper passes the batch heading; omit it when
   *  this renders as its own page and the page already has a title. */
  heading?: string;
  className?: string;
}

export default function ReviewStep({ heading, className }: ReviewStepProps) {
  const { hasConnections, isLoading: qbLoading } = useQBConnections();

  const [tab, setTab] = useState<string>('attention');
  /** Within-tab status narrowing. '' means "the whole tab". */
  const [chip, setChip] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchModal, setSearchModal] = useState<{ check: any; matchId: string } | null>(null);
  const [sideBySide, setSideBySide] = useState<any | null>(null);
  /** Starts at the default on BOTH server and first client render — the stored
   *  value is adopted in an effect, so a persisted 90 can never cause a
   *  hydration mismatch against a server-rendered 95. */
  const [minConfidence, setMinConfidence] = useState<number>(THRESHOLD_DEFAULT);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(THRESHOLD_KEY));
    if (THRESHOLD_OPTIONS.includes(stored as (typeof THRESHOLD_OPTIONS)[number])) {
      setMinConfidence(stored);
    }
  }, []);

  const changeMinConfidence = (n: number) => {
    setMinConfidence(n);
    try {
      window.localStorage.setItem(THRESHOLD_KEY, String(n));
    } catch {
      /* Private mode / quota: the session still works, it just won't persist. */
    }
  };

  const activeTab = REVIEW_TABS.find((t) => t.value === tab) || REVIEW_TABS[0];

  /** The status argument sent to the hook: a chip if one is picked, else the
   *  tab's whole union, else 'all'. */
  const statusParam = useMemo(() => {
    if (chip && chip !== 'all') return chip;
    if (chip === 'all') return 'all';
    return activeTab.statuses.length > 0 ? activeTab.statuses.join(',') : 'all';
  }, [chip, activeTab]);

  const {
    matches, total, statusCounts, isLoading, isSyncing, error,
    refresh, syncQB, approveSingle, bulkApprove, flagMatch,
    addNote, resolveDiscrepancy, remapMatch, undoApproval, createInQB, updateQBTransaction,
  } = useMatches({ status: statusParam, search: searchQuery, sort: sortBy, page, limit: perPage });

  /** Live counts. The tab counts are sums over the SAME per-status counts the
   *  chips show, so a tab can never disagree with the chips inside it. */
  const sum = (keys: readonly string[]) =>
    keys.reduce((n, k) => n + (statusCounts[k] || 0), 0);

  const tabCounts: Record<string, number> = {
    attention: sum(NEEDS_ATTENTION_STATUSES),
    settled: sum(SETTLED_STATUSES),
    all: statusCounts.all || 0,
  };

  /** Changing either tab or chip clears the selection — approving rows the user
   *  can no longer see is the bug this prevents. */
  const changeTab = (v: string) => {
    setTab(v);
    setChip('');
    setPage(1);
    setSelected(new Set());
  };
  const changeChip = (v: string) => {
    setChip((prev) => (prev === v ? '' : v));
    setPage(1);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === matches.length) setSelected(new Set());
    else setSelected(new Set(matches.map((m: any) => m.id)));
  };

  /** Two modes, unchanged: no selection auto-approves at the user's chosen
   *  confidence threshold, a selection approves exactly those ids. */
  const handleBulkApprove = async () => {
    if (selected.size === 0) await bulkApprove({ minConfidence });
    else await bulkApprove({ matchIds: Array.from(selected) });
    setSelected(new Set());
  };

  const handleRemapSelect = async (qbTxn: any) => {
    if (!searchModal) return;
    await remapMatch(searchModal.matchId, qbTxn.id);
    setSearchModal(null);
  };

  const totalPages = Math.max(1, Math.ceil((total || 0) / perPage));

  if (!qbLoading && !hasConnections) {
    return (
      <div className={cn('mx-auto max-w-7xl p-5', className)} data-tone="brand">
        <GlassCard padding="lg" className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="mb-4 h-12 w-12 text-ink-faint" aria-hidden />
          <h2 className="font-heading text-xl font-semibold text-ink-strong">No QuickBooks connection</h2>
          <p className="mt-2 max-w-md text-sm text-ink-body">
            Connect a QuickBooks company to review your extracted cheques against QB transactions.
          </p>
          <a href="/settings?tab=integrations" className="mt-5 inline-flex">
            <Button size="sm">Go to settings</Button>
          </a>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className={cn('mx-auto max-w-7xl space-y-4 p-5', className)} data-tone="brand">
      {/* ── Header: company switcher, sync, bulk approve ───────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold text-ink-strong">
            {heading || 'Review'}
          </h2>
          <p className="mt-0.5 text-sm text-ink-faint">
            Every cheque beside the QuickBooks transaction it matched.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <QBCompanySwitcher />
          <Button size="sm" loading={isSyncing} icon={<RefreshCw className="h-4 w-4" />} onClick={syncQB}>
            {isSyncing ? 'Syncing…' : 'Sync QB & match'}
          </Button>
          {/* The threshold and the action it feeds, as one unit. The Select is
              hidden while rows are selected because the threshold does not
              apply to an explicit selection — hiding it is what keeps the
              label honest. No extra row: it sits in the existing flex. */}
          {selected.size === 0 && (
            <Select
              inputSize="sm"
              value={minConfidence}
              onChange={(e) => changeMinConfidence(Number(e.target.value))}
              aria-label="Minimum confidence used by Approve All"
              title="Cheques at or above this match confidence are approved by Approve All"
              className="w-[108px]"
            >
              {THRESHOLD_OPTIONS.map((n) => (
                <option key={n} value={n}>{`≥ ${n}%`}</option>
              ))}
            </Select>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<Check className="h-4 w-4" />}
            onClick={handleBulkApprove}
          >
            {selected.size > 0
              ? `Approve ${selected.size} selected`
              : `Approve All ≥${minConfidence}%`}
          </Button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card border border-error-border bg-error-bg px-4 py-3 text-sm text-error-text"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {/* ── The three tabs. One thumb, not one surface per tab. ─────────
          `overflow-x-auto` is load-bearing at 400px: three labels at
          `whitespace-nowrap` need ~430px, so without a scroll container the
          third tab would be clipped out of reach. */}
      <div className="overflow-x-auto pb-1">
        <Tabs
          aria-label="Review"
          items={REVIEW_TABS.map((t) => ({
            value: t.value,
            label: t.label,
            icon: t.icon,
            count: tabCounts[t.value] || undefined,
          }))}
          value={tab}
          onValueChange={changeTab}
        />
      </div>

      {/* ── Toolbar: status chips, search, sort, selection. One glass card. */}
      <GlassCard padding="sm" className="space-y-3">
        {/* The seven old status filters, scoped to the active tab and still
            carrying their own live counts. Wraps rather than scrolls — a chip
            row that needs a hidden scrollbar is a chip row nobody finds. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Narrow by status">
          {activeTab.chips.map((key) => {
            const on = key === 'all' ? chip === 'all' : chip === key;
            const count = key === 'all' ? statusCounts.all || 0 : statusCounts[key] || 0;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => changeChip(key)}
                className={on ? CHIP_ON : CHIP_OFF}
              >
                {STATUS_META[key]?.icon}
                {STATUS_META[key]?.label || key}
                <span className="nums text-ink-faint">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-glass-hairline pt-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search by check #, payee, amount…"
              aria-label="Search cheques"
              className="w-full rounded-input border border-glass-hairline bg-white/70 py-2.5 pl-9 pr-4 text-sm text-ink-strong shadow-inner-track placeholder:text-ink-faint focus:border-brand focus:bg-white/90 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-ink-faint" aria-hidden />
            <Select
              inputSize="sm"
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              aria-label="Sort cheques"
              className="w-[210px]"
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
              aria-label="Select all cheques"
              className="h-4 w-4 rounded border-glass-hairline accent-primary"
            />
            <span className="nums text-xs font-medium text-ink-body">
              {selected.size > 0
                ? `${selected.size} of ${matches.length} selected`
                : `${matches.length} cheque${matches.length !== 1 ? 's' : ''}`}
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
          {tab === 'attention' && tabCounts.attention === 0 && !searchQuery && !chip ? (
            <CheckCircle2 className="mb-3 h-10 w-10 text-success" aria-hidden />
          ) : (
            <Search className="mb-3 h-10 w-10 text-ink-faint" aria-hidden />
          )}
          <p className="font-heading text-base font-semibold text-ink-strong">
            {searchQuery || chip ? 'No cheques match this filter' : 'Nothing to review here'}
          </p>
          <p className="mt-1 text-sm text-ink-body">
            {searchQuery || chip
              ? 'Clear the search or pick a different status.'
              : activeTab.empty}
          </p>
        </GlassCard>
      ) : (
        <>
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
                onOpenSideBySide={() => setSideBySide(match)}
              />
            ))}
          </div>

          {/* The up-to-200-record view. The grid's own Pagination component,
              reused — its PER_PAGE list is where 200 lives. */}
          <GlassPanel padding="none" radius="card" className="overflow-hidden">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total || matches.length}
              itemsPerPage={perPage}
              onPageChange={(p) => { setPage(Math.min(Math.max(1, p), totalPages)); setSelected(new Set()); }}
              onItemsPerPageChange={(n) => { setPerPage(n); setPage(1); setSelected(new Set()); }}
            />
          </GlassPanel>
        </>
      )}

      {searchModal && (
        <SearchQBModal
          check={searchModal.check}
          onSelect={handleRemapSelect}
          onClose={() => setSearchModal(null)}
        />
      )}

      {sideBySide && (
        <SideBySideModal match={sideBySide} onClose={() => setSideBySide(null)} />
      )}
    </div>
  );
}
