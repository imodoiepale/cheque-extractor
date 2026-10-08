'use client';

import { useState } from 'react';
import { Building2, ChevronDown, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useQBConnections } from '@/hooks/useQBConnections';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface QBCompanySwitcherProps {
  /** Extra className for the container */
  className?: string;
  /** Show just the current company name (compact mode) */
  compact?: boolean;
}

/**
 * Dropdown switcher that shows the active QB company and lets users switch
 * between connected companies. Designed to live in page headers.
 *
 * Shared by two pages, so it is owned by parcel A — do not restyle it
 * elsewhere.
 *
 * Note on blur: the trigger is a hairline pill with NO backdrop-filter, and
 * only the popover blurs (`.glass-modal`). Blurring both would nest two
 * blurred surfaces directly and both would go muddy.
 */
export function QBCompanySwitcher({ className = '', compact = false }: QBCompanySwitcherProps) {
  const { connections, active, isLoading, isSwitching, switchCompany } = useQBConnections();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex min-h-tap items-center gap-2 rounded-pill border border-glass-hairline bg-white/60 px-3',
          className
        )}
      >
        <Building2 className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        <Skeleton shape="line" className="w-24" />
      </div>
    );
  }

  if (!active) {
    return (
      <a
        href="/settings?tab=integrations"
        className={cn(
          'inline-flex min-h-tap items-center gap-2 rounded-pill border border-warning-border bg-warning-bg px-3.5',
          'text-xs font-semibold text-warning-text',
          'press hover:bg-warning-bg/80',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          className
        )}
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
        Connect QuickBooks
      </a>
    );
  }

  // Single company, or the caller asked for a read-only chip: no affordance.
  if (connections.length <= 1 || compact) {
    return (
      <Badge tone="success" size="lg" className={cn('min-h-tap px-3.5', className)}>
        <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="max-w-[180px] truncate">{active.companyName}</span>
      </Badge>
    );
  }

  const handleSwitch = async (realmId: string) => {
    setOpen(false);
    if (realmId === active.realmId) return;
    try {
      await switchCompany(realmId);
    } catch {
      // error handled inside hook
    }
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isSwitching}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex min-h-tap items-center gap-2 rounded-pill px-3.5',
          'border border-glass-border bg-white/[0.72] shadow-contact',
          'text-xs font-semibold text-ink-body',
          'press hover:border-brand/40 hover:text-brand-deep',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:opacity-disabled'
        )}
      >
        {isSwitching ? (
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" aria-hidden />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
        )}
        <span className="max-w-[160px] truncate">{active.companyName}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-ink-faint transition-transform duration-quick ease-settle',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <>
          {/* Click-away overlay */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            aria-label="QuickBooks companies"
            className="glass-modal animate-popover-in absolute left-0 top-full z-50 mt-2 min-w-[240px] overflow-hidden rounded-card py-1.5"
          >
            <p className="text-eyebrow px-3.5 py-1.5 text-ink-faint">QuickBooks Companies</p>
            {connections.map((conn) => (
              <button
                key={conn.realmId}
                type="button"
                role="option"
                aria-selected={conn.isActive}
                onClick={() => handleSwitch(conn.realmId)}
                className={cn(
                  'flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm',
                  'transition-colors duration-quick ease-settle',
                  conn.isActive
                    ? 'bg-brand/[0.08] text-brand-deep'
                    : 'text-ink-strong hover:bg-ink-strong/[0.04]'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    conn.isActive ? 'bg-brand text-white' : 'bg-neutral-bg text-ink-faint'
                  )}
                  aria-hidden
                >
                  {(conn.companyName || '?').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">
                    {conn.companyName || `Realm ${conn.realmId}`}
                  </span>
                  {conn.pendingCount > 0 && (
                    <span className="nums block text-[10px] font-medium text-warning-text">
                      {conn.pendingCount} pending
                    </span>
                  )}
                </span>
                {conn.isActive && (
                  <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-brand" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
