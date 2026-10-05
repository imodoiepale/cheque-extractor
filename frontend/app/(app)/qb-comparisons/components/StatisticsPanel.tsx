import React from 'react';
import { FileText, CheckCircle, AlertCircle, FileCheck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { GlassCard, GlassPanel } from '@/components/ui';

interface StatisticsPanelProps {
  total: number;
  matched: number;
  mismatched: number;
  missingInQB: number;
  missingInExtraction: number;
}

/**
 * The stat strip above the grid.
 *
 * Deliberately NOT five `KpiTile`s: each tile carries its own
 * `backdrop-filter`, so five of them is five composited layers, and the tile's
 * p-5/text-3xl metrics would push the table down by ~70px — rows on screen are
 * the one thing this page cannot spend. One blurred card, five unblurred
 * panels inside it.
 */
export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  total,
  matched,
  mismatched,
  missingInQB,
  missingInExtraction,
}) => {
  const stats = [
    { label: 'Total Records', value: total, icon: FileText, accent: 'text-ink-faint' },
    { label: 'Matched', value: matched, icon: CheckCircle, accent: 'text-success' },
    { label: 'Mismatched', value: mismatched, icon: AlertCircle, accent: 'text-warning' },
    { label: 'Missing in QB', value: missingInQB, icon: FileCheck, accent: 'text-brand' },
    { label: 'Missing in Extraction', value: missingInExtraction, icon: XCircle, accent: 'text-error' },
  ];

  return (
    <GlassCard padding="sm" className="mx-4 mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <GlassPanel
            key={stat.label}
            radius="input"
            padding="none"
            className="flex items-center gap-2 px-2.5 py-2"
          >
            <stat.icon size={16} className={`shrink-0 ${stat.accent}`} aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-eyebrow text-ink-faint">{stat.label}</p>
              <p className="nums text-lg font-semibold text-ink-strong">{stat.value}</p>
            </div>
          </GlassPanel>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-body">
        <span className="font-semibold text-ink-strong">QB data source:</span> configure the
        QuickBooks connection in{' '}
        <Link href="/settings" className="font-semibold text-brand-deep hover:underline">
          Settings → Integrations
        </Link>
      </p>
    </GlassCard>
  );
};
