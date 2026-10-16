'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { GlassCard } from './glass-card';

/**
 * The three non-happy states every page shares. Loading is `Skeleton` (shaped
 * like the final layout); these two cover "nothing here" and "it broke".
 * One recipe each, so no page invents its own red box or centred spinner.
 */

/** Turn whatever was thrown into one sentence a bookkeeper can act on. */
export function friendlyError(err: unknown): string {
  const raw =
    typeof err === 'string' ? err : err instanceof Error ? err.message : '';
  const msg = raw.toLowerCase();
  if (!raw) return 'Something went wrong. Please try again.';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed'))
    return 'We could not reach Kyriq. Check your connection and try again.';
  if (msg.includes('not authenticated') || msg.includes('jwt') || msg.includes('401'))
    return 'Your session has expired. Sign in again to continue.';
  if (msg.includes('403') || msg.includes('forbidden'))
    return 'Your account does not have access to this.';
  if (msg.includes('timeout') || msg.includes('timed out'))
    return 'That took too long to respond. Please try again.';
  if (/\b5\d\d\b/.test(msg) || msg.includes('internal server error') || msg.includes('database error'))
    return 'Our server had a problem. Please try again in a moment.';
  // Short, sentence-like messages from our own API are already readable.
  if (raw.length <= 140 && !/[{}<>]|https?:|\/api\//.test(raw)) return raw;
  return 'Something went wrong. Please try again.';
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** `card` wraps it in its own GlassCard; `inline` sits inside an existing one. */
  surface?: 'card' | 'inline';
  className?: string;
}

export function EmptyState({ icon, title, description, action, surface = 'card', className }: EmptyStateProps) {
  const body = (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon ? <div className="mb-3 text-ink-faint [&>svg]:h-10 [&>svg]:w-10">{icon}</div> : null}
      <h3 className="font-heading text-base font-semibold text-ink-strong">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-body">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
  return surface === 'card' ? <GlassCard padding="none">{body}</GlassCard> : body;
}

export interface ErrorStateProps {
  title?: React.ReactNode;
  /** Raw error; shown through `friendlyError`, never verbatim. */
  error?: unknown;
  /** Retry handler. May be async — the button shows pending until it settles. */
  onRetry?: () => unknown;
  retryLabel?: string;
  /** Extra actions beside Retry (e.g. a link back). */
  action?: React.ReactNode;
  surface?: 'card' | 'inline' | 'banner';
  className?: string;
}

export function ErrorState({
  title = 'We couldn’t load this',
  error,
  onRetry,
  retryLabel = 'Try again',
  action,
  surface = 'card',
  className,
}: ErrorStateProps) {
  const [pending, setPending] = React.useState(false);
  const retry = onRetry
    ? async () => {
        setPending(true);
        try {
          await onRetry();
        } finally {
          setPending(false);
        }
      }
    : undefined;

  const buttons =
    retry || action ? (
      <>
        {retry ? (
          <Button
            size="sm"
            variant={surface === 'banner' ? 'secondary' : 'primary'}
            icon={<RefreshCw size={14} />}
            loading={pending}
            onClick={retry}
          >
            {retryLabel}
          </Button>
        ) : null}
        {action}
      </>
    ) : null;

  if (surface === 'banner') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-card border border-error-border bg-error-bg px-4 py-3',
          className
        )}
      >
        <AlertCircle size={18} className="shrink-0 text-error-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-error-text">{title}</p>
          <p className="text-xs text-ink-body">{friendlyError(error)}</p>
        </div>
        {buttons ? <div className="flex gap-2">{buttons}</div> : null}
      </div>
    );
  }

  const body = (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-error-bg text-error-text">
        <AlertCircle size={22} aria-hidden />
      </span>
      <h3 className="font-heading text-base font-semibold text-ink-strong">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-body">{friendlyError(error)}</p>
      {buttons ? <div className="mt-5 flex flex-wrap justify-center gap-2">{buttons}</div> : null}
    </div>
  );
  return surface === 'card' ? <GlassCard padding="none">{body}</GlassCard> : body;
}
