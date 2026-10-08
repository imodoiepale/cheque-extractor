import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge and StatusPill.
 *
 * Glass stays neutral; colour marks state and action only (rule 10). Every
 * `-text` token below is verified >= 4.5:1 against its own `-bg`, not against
 * white — see the ratios recorded in globals.css.
 *
 * Status is never colour alone: StatusPill always renders a label, and takes
 * an optional glyph.
 */
export const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full',
    'font-medium leading-none',
  ].join(' '),
  {
    variants: {
      tone: {
        neutral: 'bg-neutral-bg text-neutral-text',
        brand: 'bg-info-bg text-info-text',
        success: 'bg-success-bg text-success-text',
        warning: 'bg-warning-bg text-warning-text',
        error: 'bg-error-bg text-error-text',
        /* Hairline over glass, for counts that must not read as state. */
        outline: 'border border-glass-hairline bg-white/60 text-ink-body',
        /* Solid, for a single emphatic count on dark chrome. */
        solid: 'bg-brand text-white',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, size, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone, size }), className)} {...props} />
  )
);
Badge.displayName = 'Badge';

/** The app's status vocabulary, mapped once so the same word is never two colours. */
export const STATUS_TONES = {
  matched: 'success',
  cleared: 'success',
  complete: 'success',
  approved: 'brand',
  processing: 'brand',
  pending: 'warning',
  review: 'warning',
  unmatched: 'warning',
  failed: 'error',
  error: 'error',
  rejected: 'error',
  draft: 'neutral',
  idle: 'neutral',
} as const;

export type StatusKey = keyof typeof STATUS_TONES;

export interface StatusPillProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: StatusKey;
  /** Overrides the mapped label. */
  label?: React.ReactNode;
  icon?: React.ReactNode;
}

export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ status, label, icon, className, size, ...props }, ref) => (
    <Badge
      ref={ref}
      tone={STATUS_TONES[status]}
      size={size}
      className={cn('capitalize', className)}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {label ?? status}
    </Badge>
  )
);
StatusPill.displayName = 'StatusPill';
