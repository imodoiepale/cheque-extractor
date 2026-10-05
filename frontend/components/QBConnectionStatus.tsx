'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { Badge, Button, GlassPanel, StatusPill } from '@/components/ui';

/**
 * QuickBooks connection diagnostics.
 *
 * NOTE: nothing in the app imports this today — settings renders its own
 * integration panel. Restyled rather than deleted so it cannot drift back into
 * raw palette classes; flagged in the parcel-H report as a deletion candidate.
 *
 * Two fields here genuinely have no source yet (token expiry, last sync) and
 * are labelled "not tracked" rather than rendered as a value.
 */

interface QBStatus {
  connected: boolean;
  configured: boolean;
  credentialsExist: boolean;
  companyName: string | null;
  realmId: string | null;
  error: string | null;
}

export default function QBConnectionStatus() {
  const [status, setStatus] = useState<QBStatus>({
    connected: false,
    configured: false,
    credentialsExist: false,
    companyName: null,
    realmId: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const integrationRes = await fetch('/api/settings/integrations');

      if (integrationRes.ok) {
        const data = await integrationRes.json();

        let companyInfo: any = null;
        if (data.qboConnected) {
          try {
            const companyRes = await fetch('/api/qbo/company-info');
            if (companyRes.ok) companyInfo = await companyRes.json();
          } catch (err) {
            console.warn('Could not fetch company info:', err);
          }
        }

        setStatus({
          connected: data.qboConnected || false,
          configured: data.qbConfigured || false,
          credentialsExist: data.credentialsExist || false,
          companyName: companyInfo?.companyName || data.companyName || null,
          realmId: data.realmId || null,
          error: null,
        });
      } else {
        const errorData = await integrationRes.json().catch(() => ({}));
        setStatus(prev => ({ ...prev, error: errorData.error || 'Failed to check status' }));
      }
    } catch (error: any) {
      setStatus(prev => ({ ...prev, error: error.message || 'Network error' }));
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  if (loading) {
    return (
      <GlassPanel tone="plain" radius="tile" padding="md">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="animate-spin text-ink-faint" aria-hidden />
          <span className="text-sm text-ink-body">Checking QuickBooks connection…</span>
        </div>
      </GlassPanel>
    );
  }

  if (status.error) {
    return (
      <div role="alert" className="rounded-tile border border-error-border bg-error-bg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-error-text" size={20} aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-error-text">Connection check failed</h3>
            <p className="mt-1 text-xs text-error-text">{status.error}</p>
          </div>
          <Button size="sm" variant="destructive" loading={checking} onClick={checkStatus}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <GlassPanel tone="plain" radius="tile" padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {status.connected
            ? <CheckCircle className="shrink-0 text-success" size={20} aria-hidden />
            : <XCircle className="shrink-0 text-warning" size={20} aria-hidden />}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-strong">
              {status.connected ? 'Connected to QuickBooks' : 'Not connected'}
            </h3>
            {status.companyName && (
              <p className="mt-0.5 truncate text-xs text-ink-body">
                Company: <span className="font-semibold">{status.companyName}</span>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          aria-label="Refresh connection status"
          title="Refresh status"
          className="press rounded-full p-2 text-ink-faint hover:text-ink-strong disabled:opacity-disabled"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : undefined} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <StatusPill
            status={status.configured ? 'complete' : 'failed'}
            label={`Credentials ${status.configured ? 'configured' : 'missing'}`}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill
            status={status.connected ? 'complete' : 'pending'}
            label={`OAuth ${status.connected ? 'active' : 'required'}`}
            size="sm"
          />
        </div>
        {status.realmId && (
          <div className="flex items-center gap-1.5 text-ink-faint sm:col-span-2">
            <span className="font-medium">Realm ID</span>
            <span className="nums font-mono text-[10px]">{status.realmId}</span>
          </div>
        )}
      </div>

      {status.connected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-glass-hairline pt-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-body">
            <Clock size={12} aria-hidden /> Token auto-refresh active
          </span>
          {/* Both of these were `null` with a TODO. Say so rather than show a blank. */}
          <Badge tone="outline" size="sm">Token expiry not tracked</Badge>
          <Badge tone="outline" size="sm">Last sync not tracked</Badge>
        </div>
      )}
    </GlassPanel>
  );
}
