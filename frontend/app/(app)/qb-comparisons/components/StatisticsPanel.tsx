import React from 'react';

interface StatisticsPanelProps {
  total: number;
  matched: number;
  mismatched: number;
  missingInQB: number;
  missingInExtraction: number;
  /** Current match-status filter, so the active chip reads as selected. */
  filterStatus: string;
  /** Clicking a chip filters the grid by that status; "total" clears it. */
  onSelectStatus: (status: string) => void;
}

/**
 * The counts, as chips — not tiles.
 *
 * These were five KPI cards inside their own glass card, which cost ~110px of
 * vertical space to show four numbers that are usually 0. They are counts, so
 * they read as one line of text on the page header's existing surface, and each
 * one filters the grid, which is what earns the space it still takes.
 */
const CHIP_BASE =
  'press rounded-pill px-2.5 py-1 text-xs transition-colors duration-tap focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  total,
  matched,
  mismatched,
  missingInQB,
  missingInExtraction,
  filterStatus,
  onSelectStatus,
}) => {
  const chips = [
    { status: 'all', label: 'total', value: total },
    { status: 'matched', label: 'matched', value: matched },
    { status: 'mismatch', label: 'mismatched', value: mismatched },
    { status: 'missing-in-qb', label: 'missing in QB', value: missingInQB },
    { status: 'missing-in-extraction', label: 'missing in extraction', value: missingInExtraction },
  ];

  return (
    <div className="glass-track inline-flex flex-wrap items-center gap-0.5 rounded-pill p-0.5">
      {chips.map((chip) => {
        const active = filterStatus === chip.status;
        return (
          <button
            key={chip.status}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectStatus(chip.status)}
            title={`Show ${chip.label}`}
            className={`${CHIP_BASE} ${
              active
                ? 'bg-brand text-white shadow-brand-glow'
                : 'text-ink-body hover:text-ink-strong'
            }`}
          >
            <span className={`nums font-semibold ${active ? 'text-white' : 'text-ink-strong'}`}>
              {chip.value}
            </span>{' '}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
};
