import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Skeletons. A sheen moved by `transform` inside an `overflow-hidden` block —
 * never an animated `background-position`, which repaints the whole element.
 *
 * Skeletons sit INSIDE a glass card, so they carry no blur of their own.
 */
export const skeletonVariants = cva('relative overflow-hidden bg-ink-strong/[0.06]', {
  variants: {
    shape: {
      line: 'h-3 rounded-full',
      text: 'h-4 rounded-full',
      heading: 'h-6 rounded-full',
      block: 'rounded-tile',
      circle: 'rounded-full aspect-square',
      pill: 'h-7 rounded-full',
    },
  },
  defaultVariants: { shape: 'line' },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    >
      <span className="absolute inset-0 animate-skeleton-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  )
);
Skeleton.displayName = 'Skeleton';

/** A few lines of placeholder prose. Last line is short, as real text is. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          shape="text"
          className={i === lines - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}

/**
 * Placeholder rows for a table. Uses the SAME row height as the real table
 * so the layout does not jump when data lands — density must not regress.
 */
export function SkeletonRows({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-glass-hairline', className)} role="status" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} shape="line" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
