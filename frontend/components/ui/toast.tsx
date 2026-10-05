'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toast.
 *
 * Blur tier 5 — the heaviest in the system (30px / 180%), because a toast
 * floats over everything and needs to read as the nearest surface.
 *
 * `react-hot-toast` drives placement and lifetime (see
 * components/providers/ToastProvider.tsx, which renders this shell through
 * its custom renderer). This component is the surface; it holds no state.
 */
export const toastVariants = cva(
  [
    'pointer-events-auto flex w-full max-w-md items-start gap-3',
    'glass-toast rounded-card px-4 py-3',
    'animate-toast-in',
  ].join(' '),
  {
    variants: {
      tone: {
        neutral: '[--toast-accent:hsl(var(--ink-faint))]',
        success: '[--toast-accent:hsl(var(--success))]',
        warning: '[--toast-accent:hsl(var(--warning))]',
        error: '[--toast-accent:hsl(var(--error))]',
        info: '[--toast-accent:hsl(var(--brand))]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

const TONE_ICON = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

export interface ToastProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof toastVariants> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Rendered to the right of the copy. Keep it to one action. */
  action?: React.ReactNode;
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, tone = 'neutral', title, description, action, ...props }, ref) => {
    const Icon = TONE_ICON[tone ?? 'neutral'];
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(toastVariants({ tone }), className)}
        {...props}
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--toast-accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          {/* Full strength over glass — translucency eats contrast. */}
          <p className="text-sm font-semibold text-ink-strong">{title}</p>
          {description ? <p className="mt-0.5 text-sm text-ink-body">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    );
  }
);
Toast.displayName = 'Toast';
