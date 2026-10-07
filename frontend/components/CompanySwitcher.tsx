'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { useQBConnections, needsReconnect, type QBConnection } from '@/hooks/useQBConnections';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { ChevronDown, Plus, Search, Check, Loader2, X, Unplug } from 'lucide-react';

/**
 * Company switcher — CHECKLIST section 4, now in the TOP BAR rather than the
 * sidebar (components/ShellTopBar.tsx mounts it).
 *
 * The active company is the server's `qb_connections.is_active`, never
 * localStorage. The match routes and the Chrome extension both read that
 * column, so a client-side switch would render company B while the engine
 * reconciled company A. useQBConnections() already does this correctly; this
 * component only renders it.
 *
 * Glass rules: the top bar is the blurred surface (tier 4), so this carries no
 * backdrop-filter of its own and the popover is OPAQUE — never nest two
 * blurred surfaces. Rows are a local plain pill, not <Button>: `secondary` IS
 * .glass-card and `ghost` carries its own blur, so neither belongs in a list.
 */
const TRIGGER =
  'flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-pill text-left press max-w-[15rem] ' +
  'bg-surface/80 hover:bg-surface border border-glass-border shadow-contact';

const POPOVER =
  'absolute top-full left-0 mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden ' +
  'rounded-card bg-surface border border-glass-border shadow-glass-modal animate-popover-in';

/** List rows: plain, no glass, no Button variant. */
const ROW =
  'group w-full flex items-center gap-2.5 px-3 py-2.5 text-left press ' +
  'hover:bg-brand-wash focus-visible:bg-brand-wash outline-none';

export function initials(name: string | null | undefined): string {
  return String(name || '?')
    .split(/[\s&,._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';
}

function Avatar({ name, size = 'sm' }: { name: string | null | undefined; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={`${size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]'} shrink-0 ` +
        'rounded-full bg-brand text-primary-foreground font-bold ' +
        'flex items-center justify-center tracking-tight'}
    >
      {initials(name)}
    </span>
  );
}

function StatusLine({ conn }: { conn: QBConnection }) {
  const broken = needsReconnect(conn.status);
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${broken ? 'bg-error' : 'bg-success'}`}
      />
      <span className={broken ? 'text-error-text font-medium' : undefined}>
        {broken ? 'Needs reconnect' : 'Connected'}
      </span>
      <span aria-hidden>·</span>
      <span className="nums">{conn.accountCount}</span>
      <span>account{conn.accountCount === 1 ? '' : 's'}</span>
    </span>
  );
}

export default function CompanySwitcher() {
  const { connections, active, isLoading, isSwitching, switchCompany, disconnect, hasConnections } =
    useQBConnections();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // A proper modal, not confirm(): a native dialog blocks the event loop,
  // cannot be styled, and on mobile reads as a browser warning.
  const [pendingDisconnect, setPendingDisconnect] = useState<QBConnection | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // /api/qbo/auth answers with {authUrl} as JSON; it does not redirect. An
  // <a href> pointed at it navigated the browser to a raw JSON document
  // instead of starting OAuth. Same fetch-then-redirect the Settings page uses.
  const [connecting, setConnecting] = useState(false);
  const startConnect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session?.access_token) {
        toast.error('Session expired. Please refresh the page.');
        return;
      }
      const res = await fetch('/api/qbo/auth', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => ({} as any));
      if (!res.ok || !body?.authUrl) {
        toast.error(body?.detail || body?.error || 'Could not start the QuickBooks connection.');
        return;
      }
      window.location.href = body.authUrl;
    } catch (err: any) {
      toast.error(err?.message || 'Could not start the QuickBooks connection.');
    } finally {
      setConnecting(false);
    }
  }, [connecting]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const filtered = useMemo(
    () =>
      connections.filter((c) =>
        (c.companyName || c.realmId).toLowerCase().includes(search.trim().toLowerCase())
      ),
    [connections, search]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 text-xs text-ink-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">Loading companies…</span>
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <button
        type="button"
        onClick={startConnect}
        disabled={connecting}
        className={`${TRIGGER} text-xs font-semibold text-primary-text disabled:opacity-disabled`}
      >
        {connecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Connect QuickBooks
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isSwitching}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={TRIGGER}
      >
        <Avatar name={active?.companyName} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-strong">
          {isSwitching ? 'Switching…' : active?.companyName || 'Select company'}
        </span>
        {active && needsReconnect(active.status) && (
          <span className="shrink-0 rounded-pill bg-error-bg px-1.5 py-0.5 text-[10px] font-semibold text-error-text">
            Reconnect
          </span>
        )}
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-soft" />
        ) : (
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform duration-quick ease-settle ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {open && (
        <div className={POPOVER} role="listbox">
          <div className="flex items-center gap-2 border-b border-glass-hairline px-3 py-2.5">
            <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              aria-label="Search clients"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-strong placeholder:text-ink-faint outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <X aria-hidden className="h-3 w-3 text-ink-soft" />
              </button>
            )}
          </div>

          <div className="max-h-64 scroll-region py-1">
            {filtered.map((conn) => (
              <div key={conn.realmId} className="relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={conn.isActive}
                  onClick={async () => {
                    if (!conn.isActive) await switchCompany(conn.realmId);
                    setOpen(false);
                  }}
                  className={`${ROW} ${conn.isActive ? 'bg-brand-wash' : ''}`}
                >
                  <Avatar name={conn.companyName} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink-strong">
                        {conn.companyName || `Realm ${conn.realmId}`}
                      </span>
                      {conn.isActive && (
                        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand" />
                      )}
                    </span>
                    <StatusLine conn={conn} />
                  </span>
                  {conn.pendingCount > 0 && (
                    <span className="mr-6 shrink-0 rounded-pill bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning-text nums">
                      {conn.pendingCount} pending
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingDisconnect(conn);
                    setOpen(false);
                  }}
                  title={`Disconnect ${conn.companyName || conn.realmId}`}
                  aria-label={`Disconnect ${conn.companyName || conn.realmId}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 press
                             text-ink-faint hover:bg-error-bg hover:text-error-text"
                >
                  <Unplug aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {filtered.length === 0 && (
              <p className="px-3 py-5 text-center text-xs text-ink-soft">No clients found</p>
            )}
          </div>

          <div className="border-t border-glass-hairline p-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                startConnect();
              }}
              disabled={connecting}
              className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-[13px] font-semibold
                         text-primary-text press hover:bg-brand-wash disabled:opacity-disabled"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span
                  aria-hidden
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-primary-foreground"
                >
                  +
                </span>
              )}
              Add New Client
            </button>
          </div>
        </div>
      )}

      <DeleteConfirmModal
        isOpen={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={() => {
          const target = pendingDisconnect;
          if (target) disconnect(target.realmId);
        }}
        title="Disconnect client?"
        message={`${pendingDisconnect?.companyName || 'This company'} will be removed from Kyriq. You can reconnect at any time — the data in QuickBooks is not affected.`}
        confirmText="Disconnect"
      />
    </div>
  );
}
