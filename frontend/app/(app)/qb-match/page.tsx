'use client';

import { useState, useMemo, Suspense } from 'react';
import { useMatches } from '@/hooks/useMatches';
import { useQBConnections } from '@/hooks/useQBConnections';
import MatchRow from '@/components/MatchRow';
import SearchQBModal from '@/components/SearchQBModal';
import {
  RefreshCw, Search, Check, AlertTriangle, Flag, Clock, HelpCircle,
  Loader2, CheckCircle2, Filter, ArrowUpDown, Building2,
} from 'lucide-react';

const STATUS_TABS = [
  { key: 'all',         label: 'All',          icon: Filter },
  { key: 'pending',     label: 'Pending',      icon: Clock },
  { key: 'matched',     label: 'Matched',      icon: Check },
  { key: 'discrepancy', label: 'Discrepancy',  icon: AlertTriangle },
  { key: 'unmatched',   label: 'Unmatched',    icon: HelpCircle },
  { key: 'flagged',     label: 'Flagged',      icon: Flag },
  { key: 'approved',    label: 'Approved',     icon: CheckCircle2 },
];

const SORT_OPTIONS = [
  { key: 'confidence', label: 'Confidence (low first)' },
  { key: 'date',       label: 'Most Recent' },
  { key: 'amount',     label: 'Largest Discrepancy' },
];

function QBMatchPageContent() {
  const { active, hasConnections, isLoading: qbLoading } = useQBConnections();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('confidence');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchModal, setSearchModal] = useState<{ check: any; matchId: string } | null>(null);

  const {
    matches, statusCounts, isLoading, isSyncing, error,
    refresh, syncQB, approveSingle, bulkApprove, flagMatch,
    addNote, resolveDiscrepancy, remapMatch, undoApproval, createInQB,
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

  // No QB connection state
  if (!qbLoading && !hasConnections) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Building2 className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-700 mb-2">No QuickBooks Connection</h2>
        <p className="text-gray-500 mb-6 max-w-md">
          Connect a QuickBooks company to start matching your extracted checks with QB transactions.
        </p>
        <a
          href="/settings?tab=integrations"
          className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QB Match Engine</h1>
          {active && (
            <p className="text-sm text-gray-500 mt-1">
              <Building2 className="w-3.5 h-3.5 inline mr-1" />
              {active.companyName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={syncQB}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isSyncing ? 'Syncing…' : 'Sync QB & Match'}
          </button>
          <button
            onClick={handleBulkApprove}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors text-sm"
          >
            <Check className="w-4 h-4" />
            {selected.size > 0 ? `Approve ${selected.size} Selected` : 'Auto-Approve ≥95%'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.key] || 0;
          const Icon = tab.icon;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + Sort bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by check #, payee, amount…"
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Select all header */}
      {matches.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <input
            type="checkbox"
            checked={selected.size === matches.length && matches.length > 0}
            onChange={selectAll}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs font-medium text-gray-600">
            {selected.size > 0
              ? `${selected.size} of ${matches.length} selected`
              : `${matches.length} match${matches.length !== 1 ? 'es' : ''}`}
          </span>
          <button onClick={refresh} className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      )}

      {/* Match rows */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <span className="text-sm">Loading matches…</span>
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Search className="w-12 h-12 mb-3" />
          <span className="text-sm font-medium text-gray-600">No matches found</span>
          <span className="text-xs text-gray-400 mt-1">
            {statusFilter !== 'all' ? 'Try a different filter' : 'Sync with QuickBooks to start matching'}
          </span>
        </div>
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
            />
          ))}
        </div>
      )}

      {/* Search QB Modal */}
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
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <QBMatchPageContent />
    </Suspense>
  );
}
