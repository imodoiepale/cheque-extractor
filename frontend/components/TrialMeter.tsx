'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * The trial meter (CHECKLIST section 6).
 *
 * The trial is 14 days OR 250 successfully processed cheques, whichever comes
 * first, and until now nothing told the user where they stood. This sits in the
 * top bar beside the switchers, so it costs no rows on screen.
 *
 * It reads /api/usage/trial-status, which is a thin wrapper over
 * public.tenant_usage_state() — the SAME function the server-side gate
 * (lib/usage-gate.ts) calls. The number shown and the number enforced cannot
 * drift, which is the whole reason there is one resolver.
 *
 * It renders NOTHING unless the tenant is actually on trial: paying customers,
 * comped pilot firms, and any state the endpoint cannot answer all return null.
 * A meter that shows "— days left" to a Scale customer is worse than no meter.
 *
 * Glass: the top bar is the one blurred surface in the main column, so this
 * carries no backdrop-filter of its own.
 */

interface TrialStatus {
  subscriptionStatus: string | null;
  daysRemaining: number | null;
  checksRemaining: number | null;
  trialCheckLimit: number | null;
  trialChecksUsed: number;
  processingAllowed: boolean;
  blockReason: string | null;
  isComped: boolean;
}

/** Narrow the parsed body. A 200 is not proof the shape is usable. */
function parseStatus(body: any): TrialStatus | null {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.subscriptionStatus !== 'string') return null;
  if (typeof body.trialChecksUsed !== 'number') return null;
  return body as TrialStatus;
}

export default function TrialMeter() {
  const [status, setStatus] = useState<TrialStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch('/api/usage/trial-status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;

        const parsed = parseStatus(await res.json());
        if (!cancelled && parsed) setStatus(parsed);
      } catch {
        // A meter is informational. It never blocks the bar it lives in.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Only tenants actually on trial. Comped firms have no trial clock to show,
  // and a subscriber's allowance is a billing concern, not a countdown.
  if (!status || status.isComped || status.subscriptionStatus !== 'trialing') return null;

  const limit = status.trialCheckLimit ?? 250;
  const checksLeft = Math.max(0, status.checksRemaining ?? limit - status.trialChecksUsed);
  const daysLeft = Math.max(0, status.daysRemaining ?? 0);
  const over = !status.processingAllowed;

  // The bar tracks whichever limit is closer to running out — that is the one
  // that will actually end the trial.
  const daysFrac = daysLeft / 14;
  const checksFrac = limit > 0 ? checksLeft / limit : 0;
  const left = Math.max(0, Math.min(1, Math.min(daysFrac, checksFrac)));

  const tone = over
    ? { text: 'text-error-text', fill: 'bg-error' }
    : left <= 0.2
    ? { text: 'text-warning-text', fill: 'bg-warning' }
    : { text: 'text-ink-soft', fill: 'bg-brand' };

  const label = over
    ? status.blockReason === 'realm_trial_already_used'
      ? 'This QuickBooks company has already had its free trial'
      : 'Free trial ended — history stays available'
    : `Free trial: ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} and ${checksLeft} of ${limit} cheques remaining`;

  return (
    <Link
      href="/settings?tab=billing"
      aria-label={label}
      title={label}
      className="flex h-9 shrink-0 items-center gap-2 rounded-pill border border-glass-border bg-surface/80 px-2.5 press hover:bg-surface"
    >
      <span className="text-[11px] font-medium leading-none text-ink-soft">Trial</span>

      {over ? (
        <span className={`text-[11px] font-semibold leading-none ${tone.text}`}>Ended</span>
      ) : (
        <>
          {/* Numbers first: the bar is the glance, the digits are the answer. */}
          <span className={`whitespace-nowrap text-[11px] font-semibold leading-none tabular-nums ${tone.text}`}>
            {daysLeft}d · {checksLeft}
          </span>
          {/* Decorative: every value above is already in text and in aria-label. */}
          <span aria-hidden className="hidden h-1 w-10 overflow-hidden rounded-full bg-neutral-bg sm:block">
            <span className={`block h-full rounded-full ${tone.fill}`} style={{ width: `${left * 100}%` }} />
          </span>
        </>
      )}
    </Link>
  );
}
