'use client';

import { useState, useRef, useEffect } from 'react';
import { useQBConnections } from '@/hooks/useQBConnections';
import { Building2, ChevronDown, Plus, Search, Check, Loader2, X, Unplug } from 'lucide-react';

/**
 * Company switcher, mounted inside the dark glass shell.
 *
 * Carries NO backdrop-filter of its own: the shell is already the heaviest
 * blur tier and nesting two blurred surfaces double-composites them (rule 2).
 * The popover is therefore an opaque `shell-solid` surface, not glass.
 */
const TRIGGER =
  'w-full flex items-center gap-2 px-3 py-2 rounded-input text-left press ' +
  'bg-shell-text/[0.06] hover:bg-shell-text/[0.1] border border-glass-border-dark';

const POPOVER =
  'absolute left-3 right-3 mt-1 z-50 overflow-hidden rounded-tile ' +
  'bg-shell-solid border border-glass-border-dark shadow-glass-modal animate-popover-in';

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
        <div className="flex items-center gap-2 text-xs text-shell-muted">
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
          className="flex items-center gap-2 text-xs text-brand-light hover:text-shell-active transition-colors duration-tap ease-settle"
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
        className={TRIGGER}
      >
        <Building2 className="w-4 h-4 text-brand-light flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-shell-text truncate">
            {isSwitching ? 'Switching…' : active?.companyName || 'Select Company'}
          </div>
          <div className="text-[10px] text-shell-muted">
            {connections.length} compan{connections.length === 1 ? 'y' : 'ies'} connected
          </div>
        </div>
        {isSwitching ? (
          <Loader2 className="w-3.5 h-3.5 text-shell-muted animate-spin flex-shrink-0" />
        ) : (
          <ChevronDown
            className={`w-3.5 h-3.5 text-shell-muted transition-transform duration-quick ease-settle flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className={POPOVER}>
          {/* Search */}
          {connections.length > 3 && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-glass-border-dark">
              <Search className="w-3.5 h-3.5 text-shell-muted" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="flex-1 bg-transparent text-xs text-shell-text placeholder:text-shell-muted/70 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X className="w-3 h-3 text-shell-muted" />
                </button>
              )}
            </div>
          )}

          {/* Company list */}
          <div className="max-h-56 scroll-region py-1">
            {filtered.map((conn) => (
              <button
                key={conn.realmId}
                onClick={async () => {
                  if (conn.isActive) return;
                  await switchCompany(conn.realmId);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left press ${
                  conn.isActive
                    ? 'bg-brand/20 text-shell-active'
                    : 'text-shell-text hover:bg-shell-text/[0.08]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {conn.companyName || `Realm ${conn.realmId}`}
                  </div>
                  {conn.pendingCount > 0 && (
                    <div className="text-[10px] text-warning nums">{conn.pendingCount} pending</div>
                  )}
                </div>
                {conn.isActive && <Check className="w-3.5 h-3.5 text-shell-active flex-shrink-0" />}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-shell-muted">No companies found</div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-glass-border-dark px-3 py-2 flex items-center justify-between">
            <a
              href="/api/qbo/auth"
              className="flex items-center gap-1 text-[11px] text-brand-light hover:text-shell-active"
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
                className="flex items-center gap-1 text-[11px] text-error hover:text-error/80"
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
