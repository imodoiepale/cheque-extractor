'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Landmark, ChevronDown } from 'lucide-react';

// Lives inside the dark glass shell, so it carries no blur of its own and the
// popover is an opaque `shell-solid` surface (rule 2: never nest two blurs).

const STORAGE_KEY = 'kyriq_active_account';

export function getActiveAccount(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export default function AccountSwitcher() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [active, setActive] = useState<string>('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || '';
    setActive(stored);
    loadAccounts();
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadAccounts() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('qb_entries')
        .select('account')
        .not('account', 'is', null)
        .order('date', { ascending: false })
        .limit(500);
      if (data) {
        const unique = Array.from(new Set(data.map((r: any) => r.account).filter(Boolean))).sort() as string[];
        setAccounts(unique);
      }
    } catch (_) {}
  }

  function select(account: string) {
    setActive(account);
    localStorage.setItem(STORAGE_KEY, account);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('kyriq_account_changed', { detail: { account } }));
  }

  if (!accounts.length) return null;

  return (
    <div ref={ref} className="relative px-3 py-1 mb-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-input text-left press bg-shell-text/[0.05] hover:bg-shell-text/[0.09] border border-glass-border-dark"
        title="Filter by bank account"
      >
        <Landmark className="w-3.5 h-3.5 text-accentEmerald flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-shell-text truncate">
            {active || 'All Accounts'}
          </div>
        </div>
        <ChevronDown className={`w-3 h-3 text-shell-muted transition-transform duration-quick ease-settle flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1 z-50 max-h-48 overflow-hidden scroll-region rounded-tile bg-shell-solid border border-glass-border-dark shadow-glass-modal animate-popover-in">
          <button
            onClick={() => select('')}
            className={`w-full text-left px-3 py-2 text-xs press ${!active ? 'bg-brand/20 text-shell-active' : 'text-shell-muted hover:bg-shell-text/[0.08] hover:text-shell-text'}`}
          >
            All Accounts
          </button>
          {accounts.map(acct => (
            <button
              key={acct}
              onClick={() => select(acct)}
              className={`w-full text-left px-3 py-2 text-xs truncate press ${active === acct ? 'bg-brand/20 text-shell-active' : 'text-shell-text hover:bg-shell-text/[0.08]'}`}
              title={acct}
            >
              {acct}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
