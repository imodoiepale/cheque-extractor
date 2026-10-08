import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

/**
 * KpiTile — the dashboard number.
 *
 * The value is tabular-nums, always. Columns and rows of figures in a
 * reconciliation product must line up, and a KPI that reflows by a pixel
 * every poll reads as broken.
 *
 * `tone` tints the accent glyph and the delta only. The glass stays neutral.
 */
export const kpiTileVariants = cva(
  [
    'relative flex flex-col gap-1.5 rounded-tile p-5',
    'glass-card',
    'transition-[box-shadow,transform] duration-settle ease-settle',
  ].join(' '),
  {
    variants: {
      tone: {
        neutral: '[--kpi-accent:hsl(var(--ink-faint))]',
        brand: '[--kpi-accent:hsl(var(--brand))]',
        success: '[--kpi-accent:hsl(var(--success))]',
        warning: '[--kpi-accent:hsl(var(--warning))]',
        error: '[--kpi-accent:hsl(var(--error))]',
      },
      interactive: {
        true: 'press hover-lift cursor-pointer text-left',
        false: '',
      },
    },
    defaultVariants: { tone: 'neutral', interactive: false },
  }
);

export interface KpiTileProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color' | 'children'>,
    VariantProps<typeof kpiTileVariants> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Short qualifier under the value, e.g. "of 428 cheques". */
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  /** Signed change. Direction drives the colour, not the tone prop. */
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  loading?: boolean;
}

export const KpiTile = React.forwardRef<HTMLDivElement, KpiTileProps>(
  (
    { className, tone, interactive, label, value, caption, icon, delta, loading, ...props },
    ref
  ) => (
    <div ref={ref} className={cn(kpiTileVariants({ tone, interactive }), className)} {...props}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-eyebrow text-ink-faint">{label}</p>
        {icon ? (
          <span className="shrink-0 text-[color:var(--kpi-accent)]" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>

      {loading ? (
        <Skeleton shape="heading" className="mt-1 w-24" />
      ) : (
        <p className="nums font-heading text-3xl font-semibold text-ink-strong">{value}</p>
      )}

      <div className="flex items-baseline gap-2">
        {caption ? <p className="text-xs text-ink-faint">{caption}</p> : null}
        {delta ? (
          <span
            className={cn(
              'nums text-xs font-semibold',
              delta.direction === 'up' && 'text-success-text',
              delta.direction === 'down' && 'text-error-text',
              delta.direction === 'flat' && 'text-ink-faint'
            )}
          >
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '–'} {delta.value}
          </span>
        ) : null}
      </div>
    </div>
  )
);
KpiTile.displayName = 'KpiTile';
