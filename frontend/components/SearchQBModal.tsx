'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, X, BookOpen, SearchX } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge, Button, Dialog, GlassPanel } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Find a QuickBooks transaction to remap a check onto.
 *
 * The overlay, the scrim, escape-to-close and the body scroll lock all come
 * from the Dialog primitive, which is also the only blurred surface here — the
 * result rows are GlassPanels and carry no backdrop-filter, so the layer count
 * does not move with the number of results.
 */

function fmt(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function quickScore(check: any, qbTxn: any): number {
  let score = 0;
  const amtDiff = Math.abs((check?.amount || 0) - (qbTxn?.amount || 0));
  if (amtDiff === 0) score += 40;
  else if (amtDiff <= 0.01) score += 38;
  else if (amtDiff <= 1) score += 25;
  else if (amtDiff <= 10) score += 15;
  else if (amtDiff <= 50) score += 5;

  const cn1 = String(check?.check_number || '').replace(/\D/g, '').replace(/^0+/, '');
  const cn2 = String(qbTxn?.doc_number || '').replace(/\D/g, '').replace(/^0+/, '');
  if (cn1 && cn2 && cn1 === cn2) score += 30;

  const d1 = new Date(check?.check_date);
  const d2 = new Date(qbTxn?.txn_date);
  const days = Math.abs(d1.getTime() - d2.getTime()) / 86400000;
  if (days === 0) score += 15;
  else if (days <= 3) score += 8;
  else if (days <= 7) score += 4;

  return Math.min(score, 100);
}

/** Four bands onto the four Badge tones. No band invents a colour. */
function scoreTone(s: number): 'success' | 'warning' | 'error' | 'neutral' {
  if (s >= 80) return 'success';
  if (s >= 60) return 'warning';
  if (s >= 40) return 'error';
  return 'neutral';
}

interface SearchQBModalProps {
  check: any;
  onSelect: (qbTxn: any) => void;
  onClose: () => void;
}

export default function SearchQBModal({ check, onSelect, onClose }: SearchQBModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (check?.payee) setQuery(check.payee);
  }, [check]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/matches/search-qb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ query: q, checkId: check?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results || []);
      setHasSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [check?.id]);

  /* Debounced: 400ms after the last keystroke, so a typed payee is one query. */
  useEffect(() => {
    if (!query.trim()) { setResults([]); setHasSearched(false); return; }
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Find QuickBooks transaction"
      description={
        <>
          Matching check <strong className="nums">#{check?.check_number || '—'}</strong> —{' '}
          <strong className="nums">{fmt(check?.amount)}</strong> to{' '}
          <strong>{check?.payee || 'unknown payee'}</strong>
        </>
      }
      footer={
        <>
          <span className="nums mr-auto text-xs text-ink-faint">
            {results.length > 0
              ? `${results.length} transaction${results.length !== 1 ? 's' : ''} found`
              : 'Showing last 90 days of transactions'}
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      {/* The check being remapped, pinned above the search so the figures the
          reader is comparing against never scroll away. */}
      <GlassPanel tone="sunken" radius="tile" padding="none" className="mb-3 grid grid-cols-2 sm:grid-cols-4">
        {[
          { label: 'Check #', value: check?.check_number || '—', nums: true },
          { label: 'Amount', value: fmt(check?.amount), nums: true },
          { label: 'Date', value: fmtDate(check?.check_date), nums: true },
          { label: 'Payee', value: check?.payee || '—', nums: false },
        ].map((item) => (
          <div key={item.label} className="min-w-0 px-4 py-2">
            <div className="text-eyebrow text-ink-faint">{item.label}</div>
            <div className={cn('truncate text-sm font-semibold text-ink-strong', item.nums && 'nums')}>
              {item.value}
            </div>
          </div>
        ))}
      </GlassPanel>

      {/* Search */}
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
        <input
          ref={inputRef}
          /* `text`, not `search`: this field has its own clear button, and
             WebKit renders a second native one next to it. */
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by payee, amount, check #, date…"
          aria-label="Search QuickBooks transactions"
          className="min-h-input flex-1 rounded-input border border-glass-hairline bg-white/70 px-3.5 py-2.5 text-sm text-ink-strong shadow-inner-track placeholder:text-ink-faint focus:border-brand focus:bg-white/90 focus:outline-none focus:ring-[3px] focus:ring-ring/50"
        />
        {isLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-label="Searching" />}
        {query && !isLoading && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(''); setResults([]); setHasSearched(false); }}
            className="press shrink-0 rounded-full p-1 text-ink-faint hover:text-ink-strong"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-input border border-error-border bg-error-bg px-3 py-2 text-sm text-error-text">
          {error}
        </p>
      )}

      {/* Results. The one scroll region in this dialog. */}
      <div className="scroll-region mt-3 max-h-[46vh]">
        {!hasSearched && !isLoading && (
          <div className="py-10 text-center">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-ink-faint" aria-hidden />
            <p className="font-heading text-base font-semibold text-ink-strong">
              Search QuickBooks transactions
            </p>
            <p className="mt-1 text-sm text-ink-body">
              Type above to search by payee name, amount or check number.
            </p>
          </div>
        )}

        {hasSearched && results.length === 0 && !isLoading && (
          <div className="py-10 text-center">
            <SearchX className="mx-auto mb-2 h-8 w-8 text-ink-faint" aria-hidden />
            <p className="font-heading text-base font-semibold text-ink-strong">No transactions found</p>
            <p className="mt-1 text-sm text-ink-body">Try a different search term.</p>
          </div>
        )}

        {results.map((txn) => {
          const score = quickScore(check, txn);
          return (
            <GlassPanel
              key={txn.id}
              tone="plain"
              radius="tile"
              padding="none"
              className="press mb-2 flex cursor-pointer items-center justify-between gap-4 px-4 py-3 hover:bg-brand/[0.06]"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(txn)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(txn)}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="outline" size="sm">{txn.txn_type || 'Transaction'}</Badge>
                  {txn.doc_number && (
                    <span className="nums text-sm font-semibold text-ink-strong">#{txn.doc_number}</span>
                  )}
                  <span className="nums-money ml-auto text-sm font-semibold text-ink-strong">
                    {fmt(txn.amount)}
                  </span>
                </div>
                <div className="nums text-xs text-ink-body">
                  {fmtDate(txn.txn_date)} · {txn.payee || 'No payee'}
                </div>
                {txn.account && <div className="mt-0.5 text-[11px] text-ink-faint">{txn.account}</div>}
                {txn.memo && <div className="text-[11px] italic text-ink-faint">&quot;{txn.memo}&quot;</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge tone={scoreTone(score)} size="md" className="nums font-bold">{score}%</Badge>
                <span className="press inline-flex items-center rounded-full bg-gradient-to-r from-brand to-brand-dark px-2.5 py-1 text-xs font-semibold text-white shadow-brand-glow">
                  Use this
                </span>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </Dialog>
  );
}
