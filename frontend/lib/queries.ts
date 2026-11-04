'use client';

/**
 * Shared server-state for the signed-in app (TanStack Query).
 *
 * One cache, one set of keys: two components that need the same thing (the
 * trial meter in the top bar and the billing page; the dashboard and the
 * comparisons grid) share one request instead of each firing their own.
 * Realtime (hooks/useRealtimeTable.ts) invalidates these keys, so a DB change
 * shows up without a manual refresh.
 */
import { QueryClient, keepPreviousData, useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function makeAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
        // Never blank a populated list while a new key or a refetch loads.
        placeholderData: keepPreviousData,
      },
    },
  });
}

/**
 * Bearer for the Next API routes. getSession() reads the local session (no
 * network round trip, unlike getUser()); one read per call.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await createClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const qk = {
  jobs: ['jobs'] as const,
  jobsSummary: ['jobs', 'summary'] as const,
  jobsFull: ['jobs', 'full'] as const,
  qbConnections: ['qb-connections'] as const,
  qboAccounts: (realmId: string | null | undefined) => ['qbo-accounts', realmId ?? null] as const,
  trialStatus: ['trial-status'] as const,
  // Not keyed by realm: the realm arrives after first render and a realm key
  // fetched the entries twice. A company switch invalidates this key instead.
  // Without a company this is the prefix, which invalidates every company's rows.
  quickbooksEntries: (realmId?: string | null) =>
    (realmId ? ['quickbooks-entries', realmId] : ['quickbooks-entries']) as readonly string[],
  integrations: ['integrations'] as const,
  matches: ['matches'] as const,
};

const byNewest = (a: { created_at?: string }, b: { created_at?: string }) =>
  new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

/** Job list without checks_data: for list views (export, history, pickers). */
export function useJobsSummary<J extends { created_at?: string } = any>() {
  return useQuery({
    queryKey: qk.jobsSummary,
    queryFn: async () => ((await apiFetch<{ jobs?: J[] }>('/api/jobs?fields=summary')).jobs || []).sort(byNewest),
  });
}

/** Job list WITH checks. Only for views that render the cheques themselves. */
export function useJobsFull<J extends { created_at?: string; status?: string } = any>(
  opts: { refetchInterval?: (jobs: J[] | undefined) => number | false } = {}
) {
  return useQuery({
    queryKey: qk.jobsFull,
    queryFn: async () => ((await apiFetch<{ jobs?: J[] }>('/api/jobs?source=auto')).jobs || []).sort(byNewest),
    refetchInterval: opts.refetchInterval ? (q) => opts.refetchInterval!(q.state.data as J[] | undefined) : undefined,
  });
}

export interface TrialStatus {
  subscriptionStatus: string | null;
  daysRemaining: number | null;
  checksRemaining: number | null;
  trialCheckLimit: number | null;
  trialChecksUsed: number;
  processingAllowed: boolean;
  blockReason: string | null;
  isComped: boolean;
}

/** Shared by the top-bar TrialMeter and the billing page: one request. */
export function useTrialStatus() {
  return useQuery({
    queryKey: qk.trialStatus,
    queryFn: () => apiFetch<TrialStatus>('/api/usage/trial-status'),
    placeholderData: undefined,
  });
}

export function useQuickbooksEntries(realmId: string | null | undefined) {
  return useQuery({
    queryKey: qk.quickbooksEntries(realmId),
    queryFn: () =>
      apiFetch<{ entries?: any[] }>(
        `/api/quickbooks/entries${realmId ? `?realmId=${encodeURIComponent(realmId)}` : ''}`
      ).then((d) => d.entries || []),
  });
}

/** /api/settings/integrations, shared: QB connected?, AI key present?, company. */
export function useIntegrations() {
  return useQuery({ queryKey: qk.integrations, queryFn: () => apiFetch<any>('/api/settings/integrations') });
}

export function useQboAccounts(realmId: string | null | undefined) {
  return useQuery({
    queryKey: qk.qboAccounts(realmId),
    queryFn: () => apiFetch<any>('/api/qbo/accounts'),
    enabled: !!realmId,
    // Another company's accounts must never stand in while this one loads.
    placeholderData: undefined,
  });
}
