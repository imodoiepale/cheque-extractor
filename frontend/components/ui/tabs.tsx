'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tabs — a segmented control.
 *
 * One recessed bordered track with an inset shadow, and a thumb moved by
 * `transform`. No per-item borders: adding borders back to the items is what
 * makes a segmented control read as the wrong platform. A transform-driven
 * thumb is also cheaper than swapping backgrounds and is the only reason the
 * movement can be animated at all.
 */

export const tabsListVariants = cva(
  'relative inline-flex items-center gap-0 rounded-pill p-1',
  {
    variants: {
      tone: {
        track: 'glass-track',
        plain: 'bg-ink-strong/[0.04] border border-glass-hairline',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { tone: 'track', block: false },
  }
);

export const tabTriggerVariants = cva(
  [
    'relative z-10 inline-flex min-h-tap flex-1 items-center justify-center gap-2',
    'rounded-pill px-4 text-sm font-medium whitespace-nowrap',
    'transition-[color,opacity] duration-quick ease-settle',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-disabled',
  ].join(' '),
  {
    variants: {
      active: {
        true: 'font-semibold text-brand-deep',
        false: 'text-ink-body hover:text-ink-strong',
      },
    },
    defaultVariants: { active: false },
  }
);

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Optional trailing count, rendered tabular so the thumb never jitters. */
  count?: number;
}

export interface TabsProps extends VariantProps<typeof tabsListVariants> {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function Tabs({ items, value, onValueChange, className, tone, block, ...rest }: TabsProps) {
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value)
  );
  const width = items.length > 0 ? 100 / items.length : 100;

  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(tabsListVariants({ tone, block }), className)}
    >
      {/* The thumb. Moved by transform only. */}
      <span
        aria-hidden
        className="glass-card absolute inset-y-1 left-1 rounded-pill transition-transform duration-settle ease-settle"
        style={{
          width: `calc((100% - 0.5rem) / ${items.length || 1})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            className={tabTriggerVariants({ active })}
            style={block ? { flexBasis: `${width}%` } : undefined}
          >
            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="nums text-xs text-ink-faint">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Panel body for a tab. Entrance is a CSS keyframe, not a JS tween. */
export function TabPanel({
  value,
  active,
  className,
  children,
}: {
  value: string;
  active: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" className={cn('animate-glass-fade', className)}>
      {children}
    </div>
  );
}
