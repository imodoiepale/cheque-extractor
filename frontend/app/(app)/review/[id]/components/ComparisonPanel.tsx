'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatConfidence } from '@/lib/utils/formatting';
import { GlassCard, GlassCardTitle, GlassPanel } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Props {
  ocrResults: any;
  aiResults: any;
}

const FIELDS = ['payee', 'amount', 'check_date', 'check_number'];

export default function ComparisonPanel({ ocrResults, aiResults }: Props) {
  const [showComparison, setShowComparison] = useState(false);

  if (!ocrResults || !aiResults) return null;

  return (
    <GlassCard padding="none" className="overflow-hidden">
      <button
        onClick={() => setShowComparison(!showComparison)}
        aria-expanded={showComparison}
        className="press flex w-full items-center justify-between gap-3 px-6 py-4 text-left hover:bg-ink-strong/[0.03]"
      >
        <GlassCardTitle className="text-base">OCR vs AI Comparison</GlassCardTitle>
        <span className="flex items-center gap-1.5 text-sm text-ink-faint">
          {showComparison ? 'Hide' : 'Show'}
          <ChevronDown
            size={16}
            className={cn('transition-transform duration-settle ease-settle', showComparison && 'rotate-180')}
          />
        </span>
      </button>

      {showComparison && (
        <div className="animate-glass-fade space-y-4 px-6 pb-6">
          {FIELDS.map(field => {
            const ocrField = ocrResults[field];
            const aiField = aiResults[field];

            if (!ocrField && !aiField) return null;

            return (
              <div key={field} className="border-t border-glass-hairline pt-4">
                <p className="mb-3 text-sm font-medium capitalize text-ink-body">
                  {field.replace('_', ' ')}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  {/* OCR */}
                  <GlassPanel radius="input" padding="sm">
                    <p className="text-eyebrow mb-1 text-ink-faint">OCR</p>
                    <p className={cn('font-medium text-ink-strong', field === 'amount' && 'nums')}>
                      {ocrField?.value || 'N/A'}
                    </p>
                    <p className="nums mt-1 text-xs text-ink-faint">
                      {formatConfidence(ocrField?.confidence || 0)}
                    </p>
                  </GlassPanel>

                  {/* AI */}
                  <GlassPanel radius="input" padding="sm">
                    <p className="text-eyebrow mb-1 text-brand-deep">AI</p>
                    <p className={cn('font-medium text-ink-strong', field === 'amount' && 'nums')}>
                      {aiField?.value || 'N/A'}
                    </p>
                    <p className="nums mt-1 text-xs text-ink-faint">
                      {formatConfidence(aiField?.confidence || 0)}
                    </p>
                  </GlassPanel>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
