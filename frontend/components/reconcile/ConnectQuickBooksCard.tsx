'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Chrome, Plug } from 'lucide-react';
import { Button, GlassCard } from '@/components/ui';
import { startQuickBooksConnect } from '@/lib/reconcile-client';
import { EXTENSION_URL } from '@/lib/extension';

/** First step for a new firm (Michael, 18 Nov): most of the work happens in the extension. */
export function AddToChromeCard() {
  return (
    <GlassCard className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-brand-wash">
        <Chrome className="h-5 w-5 text-brand-deep" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-ink-strong">Add Kyriq to Chrome</h2>
        <p className="mt-0.5 text-sm text-ink-body">Reconcile right beside QuickBooks. Most of your team will work here.</p>
      </div>
      <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="shrink-0">
        <Button size="sm">Add to Chrome</Button>
      </a>
    </GlassCard>
  );
}

/**
 * Connect QuickBooks, inline on step 1 (CHECKLIST section 3).
 *
 * Michael asked how someone jumps straight in after subscribing. The answer:
 * they land on step 1, and if QuickBooks is not connected this card sits right
 * above the upload box — so onboarding IS the same four steps they use every
 * day and there is no separate wizard and no trip to Settings.
 *
 * /api/qbo/auth answers with {authUrl} as JSON and does NOT redirect, so an
 * <a href> to it lands the user on a raw JSON document. Fetch, then redirect —
 * the same fix already made in components/CompanySwitcher.tsx.
 */
export default function ConnectQuickBooksCard() {
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const authUrl = await startQuickBooksConnect();
      if (!authUrl) {
        toast.error('Could not start the QuickBooks connection.');
        return;
      }
      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(err?.message || 'Could not start the QuickBooks connection.');
    } finally {
      setConnecting(false);
    }
  }, [connecting]);

  return (
    <GlassCard className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span
        aria-hidden
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-input bg-brand-wash"
      >
        <Plug className="h-5 w-5 text-brand-deep" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-ink-strong">Connect QuickBooks</h2>
        <p className="mt-0.5 text-sm text-ink-body">
          Needed for matching. You can upload either way.
        </p>
      </div>
      <Button size="sm" loading={connecting} onClick={connect} className="shrink-0">
        Connect QuickBooks
      </Button>
    </GlassCard>
  );
}
