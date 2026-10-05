'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, RefreshCw, AlertCircle } from 'lucide-react';
import { GlassPanel } from '@/components/ui';

/**
 * Compact "which QuickBooks company am I on" strip.
 *
 * NOTE: nothing in the app imports this today — `QBCompanySwitcher` (parcel A)
 * is the live control. It is restyled rather than deleted so it is not a
 * palette-drift landmine if someone wires it back in, and is flagged in the
 * parcel-H report as a deletion candidate.
 *
 * GlassPanel, not GlassCard: this sits inside page chrome and must not blur a
 * second time.
 */

interface CompanyInfo {
  realmId: string;
  companyName: string;
  connected: boolean;
}

interface QBCompanySelectorProps {
  onCompanyChange?: (realmId: string) => void;
}

export default function QBCompanySelector({ onCompanyChange }: QBCompanySelectorProps) {
  const [currentCompany, setCurrentCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentCompany = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/qbo/company-info');

      if (response.ok) {
        const data = await response.json();
        setCurrentCompany({
          realmId: data.realmId,
          companyName: data.companyName,
          connected: data.connected,
        });
        onCompanyChange?.(data.realmId);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || 'Not connected to QuickBooks');
        setCurrentCompany(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch company info');
      setCurrentCompany(null);
    } finally {
      setLoading(false);
    }
  }, [onCompanyChange]);

  useEffect(() => { fetchCurrentCompany(); }, [fetchCurrentCompany]);

  if (loading) {
    return (
      <GlassPanel tone="plain" radius="input" padding="none" className="flex items-center gap-2 px-3 py-2">
        <RefreshCw size={14} className="animate-spin text-ink-faint" aria-hidden />
        <span className="text-xs text-ink-body">Loading company info…</span>
      </GlassPanel>
    );
  }

  if (error || !currentCompany) {
    return (
      <div className="flex items-center gap-2 rounded-input border border-error-border bg-error-bg px-3 py-2">
        <AlertCircle size={14} className="shrink-0 text-error-text" aria-hidden />
        <span className="text-xs text-error-text">{error || 'Not connected'}</span>
        <a
          href="/settings?tab=integrations"
          className="press ml-auto text-xs font-semibold text-error-text underline-offset-2 hover:underline"
        >
          Connect
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-input border border-success-border bg-success-bg px-3 py-2">
      <Building2 size={14} className="shrink-0 text-success-text" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-success-text">
          {currentCompany.companyName}
        </div>
        <div className="text-[10px] text-success-text/80">QuickBooks connected</div>
      </div>
      <a
        href="/settings?tab=integrations&action=reconnect"
        title="Switch to a different QuickBooks company"
        className="press text-xs font-semibold text-success-text underline-offset-2 hover:underline"
      >
        Switch
      </a>
    </div>
  );
}
