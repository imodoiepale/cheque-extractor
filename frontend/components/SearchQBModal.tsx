'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (s >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  if (s >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
  return 'text-gray-500 bg-gray-50 border-gray-200';
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

  useEffect(() => {
    if (!query.trim()) { setResults([]); setHasSearched(false); return; }
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  async function doSearch(q: string) {
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
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-5" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-[660px] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-start px-5 pt-5 pb-4 border-b border-gray-200">
          <div>
            <div className="text-base font-bold text-gray-900 mb-1">Find QuickBooks Transaction</div>
            <div className="text-sm text-gray-500">
              Matching check <strong>#{check?.check_number || '—'}</strong> — {fmt(check?.amount)} to{' '}
              <strong>{check?.payee || 'unknown payee'}</strong>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Check summary strip */}
        <div className="flex bg-gray-50 border-b border-gray-200">
          {[
            { label: 'Check #', value: check?.check_number || '—' },
            { label: 'Amount', value: fmt(check?.amount) },
            { label: 'Date', value: fmtDate(check?.check_date) },
            { label: 'Payee', value: check?.payee || '—' },
          ].map((item) => (
            <div key={item.label} className="flex-1 px-4 py-2 border-r border-gray-200 last:border-r-0">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{item.label}</div>
              <div className="text-sm font-semibold text-gray-900 truncate">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by payee, amount, check #, date…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {isLoading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />}
          {query && !isLoading && (
            <button onClick={() => { setQuery(''); setResults([]); setHasSearched(false); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {!hasSearched && !isLoading && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-2xl mb-2">📚</div>
              <div className="font-semibold text-gray-700">Search QuickBooks transactions</div>
              <div className="text-sm text-gray-400 mt-1">Type above to search by payee name, amount, or check number</div>
            </div>
          )}

          {hasSearched && results.length === 0 && !isLoading && (
            <div className="text-center py-10 text-gray-500">
              <div className="text-2xl mb-2">🤷</div>
              <div className="font-semibold text-gray-700">No transactions found</div>
              <div className="text-sm text-gray-400 mt-1">Try a different search term</div>
            </div>
          )}

          {results.map((txn) => {
            const score = quickScore(check, txn);
            return (
              <div
                key={txn.id}
                onClick={() => onSelect(txn)}
                className="flex justify-between items-center px-4 py-3 rounded-lg border border-gray-200 mb-2 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {txn.txn_type || 'Transaction'}
                    </span>
                    {txn.doc_number && <span className="text-sm font-bold text-gray-900">#{txn.doc_number}</span>}
                    <span className="text-sm font-bold text-gray-900 ml-auto">{fmt(txn.amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500">{fmtDate(txn.txn_date)} · {txn.payee || 'No payee'}</div>
                  {txn.account && <div className="text-[11px] text-gray-400 mt-0.5">{txn.account}</div>}
                  {txn.memo && <div className="text-[11px] text-gray-400 italic">&quot;{txn.memo}&quot;</div>}
                </div>
                <div className="flex flex-col items-end gap-2 ml-4 flex-shrink-0">
                  <span className={`text-sm font-extrabold px-2.5 py-0.5 rounded-full border ${scoreColor(score)}`}>
                    {score}%
                  </span>
                  <button className="px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 whitespace-nowrap">
                    Use this →
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-400">
            {results.length > 0
              ? `${results.length} transaction${results.length !== 1 ? 's' : ''} found`
              : 'Showing last 90 days of transactions'}
          </span>
          <button onClick={onClose} className="px-3 py-1.5 text-sm font-semibold bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
