'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useQBConnections } from '@/hooks/useQBConnections';
import { ChevronDown, Check, CreditCard, Landmark, Loader2, RefreshCw } from 'lucide-react';

/**
 * Account switcher — CHECKLIST section 4, in the TOP BAR next to the company
 * switcher (components/ShellTopBar.tsx mounts both).
 *
 * What it replaces: this component used to build plain strings out of
 * `qb_entries.account` — no type, no balance, no last four, and no credit
 * cards at all. It now reads /api/qbo/accounts, which serves the `qb_accounts`
 * cache (migration 036) and only touches QuickBooks on the refresh below.
 * That matters because the switcher is on every page and Intuit's free read
 * quota blocks rather than bills.
 *
 * The SELECTED account is a per-viewer view filter, so localStorage is the
 * right home for it. The active COMPANY is not — that lives in
 * qb_connections.is_active, server-side, because the match routes and the
 * extension read it.
 *
 * Glass rules: the top bar is the blurred surface, so this carries no blur and
 * the popover is opaque. Rows are a local plain pill, never a Button variant.
 */
const STORAGE_KEY = 'kyriq_active_account';

const TRIGGER =
  'flex items-center gap-2 h-9 px-2.5 rounded-pill text-left press max-w-[15rem] ' +
  'bg-surface/80 hover:bg-surface border border-glass-border shadow-contact';

const POPOVER =
  'absolute top-full left-0 mt-2 z-50 w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden ' +
  'rounded-card bg-surface border border-glass-border shadow-glass-modal animate-popover-in';

const ROW =
  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left press ' +
  'hover:bg-brand-wash focus-visible:bg-brand-wash outline-none';

export interface QbAccount {
  id: string;
  name: string;
  accountType: string;
  accountSubType: string | null;
  currentBalance: number | null;
  lastFour: string | null;
  active: boolean;
}

export function getActiveAccount(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** Money, with the sign kept: a negative card balance is the normal case. */
export function formatBalance(balance: number | null): string {
  if (balance === null || Number.isNaN(balance)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance);
}

export function accountLabel(account: QbAccount): string {
  return account.lastFour ? `${account.name} ···${account.lastFour}` : account.name;
}

const GROUPS = [
  { key: 'Bank', label: 'Bank Accounts', Icon: Landmark },
  { key: 'Credit Card', label: 'Credit Cards', Icon: CreditCard },
] as const;

export default function AccountSwitcher() {
  const { active: activeCompany } = useQBConnections();
  const [accounts, setAccounts] = useState<QbAccount[]>([]);
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/qbo/accounts${refresh ? '?refresh=1' : ''}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const body = await res.json();
      setAccounts(body.accounts || []);
      setSyncedAt(body.syncedAt || null);
    } catch {
      // A switcher that cannot reach the cache renders nothing rather than
      // blocking the chrome it sits in.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setActiveId(localStorage.getItem(STORAGE_KEY) || '');
    } catch {
      /* private window or blocked site data */
    }
  }, []);

  // Reload when the company changes: a different company has a different chart
  // of accounts, and keeping the old list would offer accounts that belong to
  // somebody else's books.
  useEffect(() => {
    if (!activeCompany?.realmId) {
      setAccounts([]);
      return;
    }
    load(false);
  }, [activeCompany?.realmId, load]);

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

  const select = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore — the filter is a convenience, not state anything depends on */
    }
    setOpen(false);
    window.dispatchEvent(new CustomEvent('kyriq_account_changed', { detail: { account: id } }));
  }, []);

  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        rows: accounts.filter((a) => a.accountType === g.key),
      })).filter((g) => g.rows.length > 0),
    [accounts]
  );

  const selected = accounts.find((a) => a.id === activeId) || null;

  if (!activeCompany) return null;

  const TriggerIcon = selected?.accountType === 'Credit Card' ? CreditCard : Landmark;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={TRIGGER}
      >
        <TriggerIcon aria-hidden className="h-4 w-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-strong">
          {selected ? accountLabel(selected) : 'All accounts'}
        </span>
        {selected && (
          <span className="hidden shrink-0 rounded-pill bg-success-bg px-1.5 py-0.5 text-[11px] font-semibold text-success-text nums-money sm:block">
            {formatBalance(selected.currentBalance)}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-ink-soft transition-transform duration-quick ease-settle ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className={POPOVER} role="listbox">
          <div className="max-h-72 scroll-region">
            <button
              type="button"
              role="option"
              aria-selected={!activeId}
              onClick={() => select('')}
              className={`${ROW} ${!activeId ? 'bg-brand-wash' : ''}`}
            >
              <span className="min-w-0 flex-1 text-[13px] font-medium text-ink-strong">
                All accounts
              </span>
              {!activeId && <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand" />}
            </button>

            {grouped.map(({ key, label, Icon, rows }) => (
              <div key={key}>
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  <Icon aria-hidden className="h-3 w-3" />
                  {label}
                </p>
                {rows.map((acct) => (
                  <button
                    key={acct.id}
                    type="button"
                    role="option"
                    aria-selected={acct.id === activeId}
                    onClick={() => select(acct.id)}
                    className={`${ROW} ${acct.id === activeId ? 'bg-brand-wash' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-ink-strong">
                          {acct.name}
                        </span>
                        {acct.lastFour && (
                          <span className="shrink-0 text-[11px] text-ink-soft nums">
                            ···{acct.lastFour}
                          </span>
                        )}
                        {acct.id === activeId && (
                          <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand" />
                        )}
                      </span>
                      {acct.accountSubType && (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-soft">
                          {acct.accountSubType}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 text-[13px] font-semibold nums-money ${
                        (acct.currentBalance ?? 0) < 0 ? 'text-error-text' : 'text-ink-body'
                      }`}
                    >
                      {formatBalance(acct.currentBalance)}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {grouped.length === 0 && (
              <p className="px-3 py-5 text-center text-xs text-ink-soft">
                {loading ? 'Loading accounts…' : 'No bank or credit-card accounts found'}
              </p>
            )}
          </div>

          <div className="border-t border-glass-hairline p-2">
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-[13px] text-ink-body
                         press hover:bg-brand-wash disabled:opacity-disabled"
            >
              {loading ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw aria-hidden className="h-4 w-4" />
              )}
              Refresh account balances
              {syncedAt && !loading && (
                <span className="ml-auto text-[10px] text-ink-faint nums">
                  {new Date(syncedAt).toLocaleDateString()}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
