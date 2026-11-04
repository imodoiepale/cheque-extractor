'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQBConnections } from '@/hooks/useQBConnections';
import { apiFetch, qk, useQboAccounts } from '@/lib/queries';
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
const NAME_KEY = 'kyriq_active_account_name';

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
  /** What qb_entries.account holds: sub-accounts read "Parent:Child". */
  fullName?: string;
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

/** The selected account as it reads on qb_entries, for pages that filter by it. */
export function getActiveAccountName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

/** Money, with the sign kept: a negative card balance is the normal case. */
export function formatBalance(balance: number | null): string {
  if (balance === null || Number.isNaN(balance)) return '-';
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
  const [activeId, setActiveId] = useState('');
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // ['qbo-accounts', realmId]: keyed by company, so a switch never shows the
  // previous company's chart of accounts. A failure renders nothing rather than
  // blocking the chrome it sits in.
  const realmId = activeCompany?.realmId ?? null;
  const accountsQ = useQboAccounts(realmId);
  const accounts: QbAccount[] = useMemo(
    () => (realmId && accountsQ.data?.accounts) || [],
    [realmId, accountsQ.data]
  );
  const syncedAt: string | null = accountsQ.data?.syncedAt || null;
  const loading = refreshing || (!!realmId && accountsQ.isFetching && !accountsQ.data);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const body = await apiFetch('/api/qbo/accounts?refresh=1');
      queryClient.setQueryData(qk.qboAccounts(realmId), body);
    } catch {
      /* keep the cached list */
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, realmId]);

  useEffect(() => {
    try {
      setActiveId(localStorage.getItem(STORAGE_KEY) || '');
    } catch {
      /* private window or blocked site data */
    }
  }, []);

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
    const acct = accounts.find((a) => a.id === id);
    const name = acct ? acct.fullName || acct.name : '';
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore — the filter is a convenience, not state anything depends on */
    }
    setOpen(false);
    window.dispatchEvent(new CustomEvent('kyriq_account_changed', { detail: { account: id, name } }));
  }, [accounts]);

  // Re-apply the saved choice once accounts load: this clears an account left
  // over from another company, and fills in the name for selections saved
  // before the name was stored.
  useEffect(() => {
    if (!realmId || !accountsQ.data || !activeId) return;
    const acct = accounts.find((a) => a.id === activeId);
    if (!acct || getActiveAccountName() !== (acct.fullName || acct.name)) select(acct ? activeId : '');
  }, [realmId, accountsQ.data, accounts, activeId, select]);

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
              onClick={() => load()}
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
