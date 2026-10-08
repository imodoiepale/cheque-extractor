'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface UseMatchesOptions {
  /** One status, 'all', or a comma-separated union (the Review step's tabs). */
  status?: string;
  search?: string;
  sort?: string;
  /** 1-based. */
  page?: number;
  /** Records per page. The grid offers up to 2000; do not cap it lower here. */
  limit?: number;
  /**
   * Scope every read to one reconciliation batch. Omitted (or null) means the
   * whole active company, which is right for a standalone matches view but
   * WRONG inside the stepper: an unscoped Review tab shows other periods'
   * cheques and its counts then contradict the stepper's batch_counts().
   */
  batchId?: string | null;
}

export function useMatches({
  status = 'all',
  search = '',
  sort = 'confidence',
  page = 1,
  limit = 50,
  batchId = null,
}: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchDebounced = useDebounce(search, 350);

  /**
   * Which statuses the current view is showing. `status` may be a union, so the
   * optimistic "did this row just leave the list?" decision has to be set
   * membership, not string equality: with `status` = 'pending,flagged,...',
   * `status === 'flagged'` is false, and flagging a row would have dropped it
   * out of the very tab that is supposed to contain it.
   */
  const viewStatuses = useMemo(
    () => new Set(status.split(',').map((s) => s.trim()).filter(Boolean)),
    [status]
  );
  const showsStatus = useCallback(
    (s: string) => status === 'all' || viewStatuses.has(s),
    [status, viewStatuses]
  );

  const fetchMatches = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ sort, page: String(page), limit: String(limit) });
      if (status && status !== 'all') params.set('status', status);
      if (searchDebounced) params.set('search', searchDebounced);
      if (batchId) params.set('batchId', batchId);

      const data = await apiFetch(`/api/matches?${params}`);
      if (!Array.isArray(data.matches)) {
        // A 200 is not proof of success: assert on the parsed shape.
        throw new Error('Matches response did not contain a matches array');
      }
      setMatches(data.matches || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.matches || []).length);
      setStatusCounts(data.statusCounts || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [status, searchDebounced, sort, page, limit, batchId]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const updateLocal = useCallback((matchId: string, patch: any) => {
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, ...patch } : m)));
  }, []);

  const removeLocal = useCallback((matchId: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  }, []);

  const syncQB = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      await apiFetch('/api/matches/sync-qb', { method: 'POST' });
      await fetchMatches();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchMatches]);

  const approveSingle = useCallback(
    async (matchId: string) => {
      updateLocal(matchId, { status: 'approved' });
      try {
        await apiFetch(`/api/matches/${matchId}/approve`, { method: 'POST' });
        if (!showsStatus('approved')) removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, showsStatus]
  );

  const bulkApprove = useCallback(
    async (body: any = {}) => {
      setError(null);
      try {
        const result = await apiFetch('/api/matches/bulk-approve', {
          method: 'POST',
          // The batch this hook is reading is the batch it may approve. Sent
          // from here rather than left to each caller, so a new call site
          // cannot forget it and quietly approve another batch's matches.
          body: JSON.stringify({ ...(batchId ? { batchId } : {}), ...body }),
        });
        await fetchMatches();
        return result;
      } catch (e: any) {
        setError(e.message);
      }
    },
    [fetchMatches, batchId]
  );

  const flagMatch = useCallback(
    async (matchId: string, reason: string = '') => {
      updateLocal(matchId, { status: 'flagged', flagged_reason: reason });
      try {
        await apiFetch(`/api/matches/${matchId}/flag`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        if (!showsStatus('flagged')) removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, showsStatus]
  );

  const addNote = useCallback(
    async (matchId: string, note: string) => {
      updateLocal(matchId, { notes: note });
      try {
        await apiFetch(`/api/matches/${matchId}/note`, {
          method: 'POST',
          body: JSON.stringify({ note }),
        });
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, fetchMatches]
  );

  const resolveDiscrepancy = useCallback(
    async (matchId: string, resolution: string, amount: number | null, notes: string) => {
      updateLocal(matchId, { status: 'matched', resolution, resolution_notes: notes });
      try {
        await apiFetch(`/api/matches/${matchId}/resolve-discrepancy`, {
          method: 'POST',
          body: JSON.stringify({ resolution, amount, notes }),
        });
        if (!showsStatus('matched')) removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, showsStatus]
  );

  const remapMatch = useCallback(
    async (matchId: string, qbTxnId: string) => {
      setError(null);
      try {
        const updated = await apiFetch(`/api/matches/${matchId}/remap`, {
          method: 'POST',
          body: JSON.stringify({ qbTxnId }),
        });
        await fetchMatches();
        return updated;
      } catch (e: any) {
        setError(e.message);
      }
    },
    [fetchMatches]
  );

  const undoApproval = useCallback(
    async (matchId: string) => {
      updateLocal(matchId, { status: 'matched', approved_at: null, approved_by: null });
      try {
        await apiFetch(`/api/matches/${matchId}/undo-approval`, { method: 'POST' });
        if (!showsStatus('matched')) removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, showsStatus]
  );

  const createInQB = useCallback(
    async (checkId: string) => {
      setError(null);
      try {
        const result = await apiFetch('/api/matches/create-in-qb', {
          method: 'POST',
          body: JSON.stringify({ checkId }),
        });
        await fetchMatches();
        return result;
      } catch (e: any) {
        setError(e.message);
        throw e;
      }
    },
    [fetchMatches]
  );

  const updateQBTransaction = useCallback(
    async (qbTxnId: string, fields: { txnDate?: string; docNumber?: string; memo?: string }) => {
      setError(null);
      try {
        const result = await apiFetch('/api/qbo/update-transaction', {
          method: 'PATCH',
          body: JSON.stringify({ qbTxnId, fields }),
        });
        // Optimistically patch the local qb_txn data on the matching match row.
        setMatches((prev) =>
          prev.map((m) => {
            if (!m.qb_txn || m.qb_txn.id !== qbTxnId) return m;
            return {
              ...m,
              qb_txn: {
                ...m.qb_txn,
                ...(fields.txnDate   ? { txn_date: fields.txnDate }   : {}),
                ...(fields.docNumber ? { doc_number: fields.docNumber } : {}),
                ...(fields.memo      ? { memo: fields.memo }           : {}),
              },
            };
          })
        );
        return result;
      } catch (e: any) {
        setError(e.message);
        throw e;
      }
    },
    []
  );

  return {
    matches,
    total,
    statusCounts,
    isLoading,
    isSyncing,
    error,
    refresh: fetchMatches,
    syncQB,
    approveSingle,
    bulkApprove,
    flagMatch,
    addNote,
    resolveDiscrepancy,
    remapMatch,
    undoApproval,
    createInQB,
    updateQBTransaction,
  };
}
