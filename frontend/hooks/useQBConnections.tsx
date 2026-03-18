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
      setConnections(data.connections || []);
      setActive(data.activeConnection || null);
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
        const data = await res.json();

        setActive(data.activeConnection);
        setConnections((prev) =>
          prev.map((c) => ({ ...c, isActive: c.realmId === realmId }))
        );
        return data.activeConnection;
      } catch (err: any) {
        setError(err.message);
        throw err;
      } finally {
        setIsSwitching(false);
      }
    },
    [active]
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
