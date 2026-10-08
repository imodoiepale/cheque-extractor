'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface QBConnection {
  id: string;
  realmId: string;
  companyName: string;
  logoUrl?: string;
  isActive: boolean;
  connectedAt: string;
  pendingCount: number;
  /** qb_connections.status — connection HEALTH, not which company is selected. */
  status: QbConnectionHealth;
  /** Cached bank + credit-card accounts for this company (migration 036). */
  accountCount: number;
}

export type QbConnectionHealth =
  | 'connected'
  | 'needs_reconnect'
  | 'error'
  | 'revoked'
  | 'unknown';

/** The two statuses that mean only the user can fix it. */
export function needsReconnect(status: QbConnectionHealth | undefined): boolean {
  return status === 'needs_reconnect' || status === 'revoked';
}

interface QBContextValue {
  connections: QBConnection[];
  active: QBConnection | null;
  isLoading: boolean;
  isSwitching: boolean;
  error: string | null;
  switchCompany: (realmId: string) => Promise<QBConnection | undefined>;
  disconnect: (realmId: string) => Promise<void>;
  refresh: () => Promise<void>;
  hasConnections: boolean;
  connectionCount: number;
}

const QBContext = createContext<QBContextValue | null>(null);

export function QBProvider({ children }: { children: ReactNode }) {
  const qb = useQBConnectionsInternal();
  return <QBContext.Provider value={qb}>{children}</QBContext.Provider>;
}

export function useQBConnections(): QBContextValue {
  const ctx = useContext(QBContext);
  if (!ctx) throw new Error('useQBConnections must be used inside <QBProvider>');
  return ctx;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function useQBConnectionsInternal(): QBContextValue {
  const [connections, setConnections] = useState<QBConnection[]>([]);
  const [active, setActive] = useState<QBConnection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/qb/connections', { headers });
      if (!res.ok) {
        // Not an error if user simply has no connections yet
        if (res.status === 400 || res.status === 404) {
          setConnections([]);
          setActive(null);
          return;
        }
        throw new Error('Failed to fetch connections');
      }
      const data = await res.json();
      const normalise = (c: any): QBConnection => ({
        ...c,
        status: (c?.status as QbConnectionHealth) || 'connected',
        accountCount: c?.accountCount ?? 0,
        pendingCount: c?.pendingCount ?? 0,
      });
      setConnections((data.connections || []).map(normalise));
      setActive(data.activeConnection ? normalise(data.activeConnection) : null);
    } catch (err: any) {
      // Silently handle — user may not have qb_connections table yet
      console.warn('QB connections fetch:', err.message);
      setConnections([]);
      setActive(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchCompany = useCallback(
    async (realmId: string) => {
      if (realmId === active?.realmId) return active;
      setIsSwitching(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/qb/switch', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ realmId }),
        });
        if (!res.ok) throw new Error('Failed to switch company');
        await res.json();

        // The active company lives in qb_connections.is_active, which the POST
        // above just moved — never in localStorage. The matching routes and the
        // extension read that column, so a client-side-only switch would show
        // company B while the match engine still worked on company A.
        //
        // The row already in state carries the health status, account count and
        // pending count; /api/qb/switch answers with an identity only, so
        // adopting its payload here would blank all three.
        const next = connections.find((c) => c.realmId === realmId) ?? null;
        setActive(next ? { ...next, isActive: true } : null);
        setConnections((prev) =>
          prev.map((c) => ({ ...c, isActive: c.realmId === realmId }))
        );
        return next ?? undefined;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSwitching(false);
      }
    },
    [active, connections]
  );

  const disconnect = useCallback(
    async (realmId: string) => {
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/qbo/disconnect', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ realmId }),
        });
        await refresh();
      } catch (err: any) {
        setError(err.message);
      }
    },
    [refresh]
  );

  return {
    connections,
    active,
    isLoading,
    isSwitching,
    error,
    switchCompany,
    disconnect,
    refresh,
    hasConnections: connections.length > 0,
    connectionCount: connections.length,
  };
}
