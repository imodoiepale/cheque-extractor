'use client';

import { useState, useEffect, useCallback } from 'react';
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
  status?: string;
  search?: string;
  sort?: string;
}

export function useMatches({ status = 'all', search = '', sort = 'confidence' }: UseMatchesOptions = {}) {
  const [matches, setMatches] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchDebounced = useDebounce(search, 350);

  const fetchMatches = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      if (status && status !== 'all') params.set('status', status);
      if (searchDebounced) params.set('search', searchDebounced);

      const data = await apiFetch(`/api/matches?${params}`);
      setMatches(data.matches || []);
      setStatusCounts(data.statusCounts || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [status, searchDebounced, sort]);

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
        if (status && !['all', 'approved'].includes(status)) {
          removeLocal(matchId);
        }
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, status]
  );

  const bulkApprove = useCallback(
    async (body: any = {}) => {
      setError(null);
      try {
        const result = await apiFetch('/api/matches/bulk-approve', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        await fetchMatches();
        return result;
      } catch (e: any) {
        setError(e.message);
      }
    },
    [fetchMatches]
  );

  const flagMatch = useCallback(
    async (matchId: string, reason: string = '') => {
      updateLocal(matchId, { status: 'flagged', flagged_reason: reason });
      try {
        await apiFetch(`/api/matches/${matchId}/flag`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        if (status && !['all', 'flagged'].includes(status)) {
          removeLocal(matchId);
        }
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, status]
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
        if (status === 'discrepancy') removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, status]
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
        if (status === 'approved') removeLocal(matchId);
      } catch (e: any) {
        setError(e.message);
        await fetchMatches();
      }
    },
    [updateLocal, removeLocal, fetchMatches, status]
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

  return {
    matches,
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
  };
}
