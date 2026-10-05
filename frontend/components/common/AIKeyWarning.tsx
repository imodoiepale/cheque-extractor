'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button, GlassCard } from '@/components/ui';

/**
 * Floating warning that the Gemini key is missing, so extraction will fall back
 * to OCR only.
 *
 * NOTE: nothing in the app imports this today. Restyled rather than deleted;
 * flagged in the parcel-H report as a deletion candidate.
 *
 * This one IS a GlassCard: it floats over the page rather than sitting inside
 * another surface, so it is the top blurred element in its own stack.
 */
export default function AIKeyWarning() {
  const [hasAIKey, setHasAIKey] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAIKeyStatus = async () => {
      try {
        const response = await fetch('/api/settings/integrations');
        if (response.ok) {
          const data = await response.json();
          setHasAIKey(!!data.geminiApiKey);
        }
      } catch (error) {
        console.error('Failed to check AI key status:', error);
      } finally {
        setLoading(false);
      }
    };
    checkAIKeyStatus();
  }, []);

  if (loading || hasAIKey || isDismissed) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 mx-4 w-full max-w-2xl -translate-x-1/2">
      <GlassCard tier="modal" padding="md" role="alert" className="border-l-4 border-l-warning">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={20} aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-sm font-semibold text-ink-strong">
              AI key not connected
            </h3>
            <p className="mt-1 text-sm text-ink-body">
              No Google Gemini API key is configured. Cheque processing will use OCR only, which
              reads fewer fields correctly.
            </p>
            <Link href="/settings/integrations" className="mt-3 inline-flex">
              <Button size="sm" icon={<Settings size={14} />}>Configure AI key</Button>
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Dismiss warning"
            className="press shrink-0 rounded-full p-1 text-ink-faint hover:text-ink-strong"
          >
            <X size={18} />
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
