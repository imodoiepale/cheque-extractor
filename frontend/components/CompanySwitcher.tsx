'use client';

import { useState, useRef, useEffect } from 'react';
import { useQBConnections } from '@/hooks/useQBConnections';
import { Building2, ChevronDown, Plus, Search, Check, Loader2, X, Unplug } from 'lucide-react';

export default function CompanySwitcher() {
  const { connections, active, isLoading, isSwitching, switchCompany, disconnect, hasConnections } =
    useQBConnections();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (isLoading) {
    return (
      <div className="px-3 py-2 mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading companies…
        </div>
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <div className="px-3 py-2 mb-2">
        <a
          href="/api/qbo/auth"
          className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Connect QuickBooks
        </a>
      </div>
    );
  }

  const filtered = connections.filter((c) =>
    c.companyName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative px-3 py-2 mb-2">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isSwitching}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 transition-all text-left"
      >
        <Building2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white truncate">
            {isSwitching ? 'Switching…' : active?.companyName || 'Select Company'}
          </div>
          <div className="text-[10px] text-gray-400">
            {connections.length} compan{connections.length === 1 ? 'y' : 'ies'} connected
          </div>
        </div>
        {isSwitching ? (
          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
        ) : (
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-3 right-3 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Search */}
          {connections.length > 3 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
              <Search className="w-3.5 h-3.5 text-gray-500" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
          )}

          {/* Company list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((conn) => (
              <button
                key={conn.realmId}
                onClick={async () => {
                  if (conn.isActive) return;
                  await switchCompany(conn.realmId);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  conn.isActive
                    ? 'bg-indigo-500/10 text-indigo-300'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {conn.companyName || `Realm ${conn.realmId}`}
                  </div>
                  {conn.pendingCount > 0 && (
                    <div className="text-[10px] text-amber-400">{conn.pendingCount} pending</div>
                  )}
                </div>
                {conn.isActive && <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-500">No companies found</div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 px-3 py-2 flex items-center justify-between">
            <a
              href="/api/qbo/auth"
              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
            >
              <Plus className="w-3 h-3" />
              Add Company
            </a>
            {active && (
              <button
                onClick={async () => {
                  if (!confirm(`Disconnect ${active.companyName}?`)) return;
                  await disconnect(active.realmId);
                  setOpen(false);
                }}
                className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
              >
                <Unplug className="w-3 h-3" />
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
