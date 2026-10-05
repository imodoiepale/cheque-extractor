'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { IconButton } from './button';

/**
 * Dialog and Sheet.
 *
 * In and out are asymmetric: a dialog arrives like an object (460ms spring
 * from scale(0.86)) and dismisses instantly (180ms). Entrances are CSS
 * keyframes, never a framer-motion tween — rAF is frozen in a hidden
 * document, so a JS tween from `opacity: 0` can leave content permanently
 * invisible if the tab was backgrounded at mount.
 *
 * Sheets translate from 110%, not 100%, so the shadow clears the viewport too.
 *
 * Only ONE blurred surface in the stack: the overlay is a plain tinted scrim,
 * the panel carries the blur.
 */

export const dialogPanelVariants = cva(
  'relative w-full glass-modal rounded-modal text-ink-strong animate-dialog-pop',
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-2xl',
        full: 'max-w-5xl',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export const sheetPanelVariants = cva(
  'fixed glass-modal text-ink-strong shadow-glass-sheet',
  {
    variants: {
      side: {
        bottom: 'inset-x-0 bottom-0 rounded-t-modal animate-sheet-up',
        right: 'inset-y-0 right-0 h-full w-full max-w-md rounded-l-modal animate-glass-rise',
        left: 'inset-y-0 left-0 h-full w-full max-w-md rounded-r-modal animate-glass-rise',
      },
    },
    defaultVariants: { side: 'bottom' },
  }
);

/** Escape-to-close + body scroll lock, shared by Dialog and Sheet. */
function useDismiss(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

interface OverlayBaseProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Rendered as the header title when `header` is unset. */
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Hide the corner close button (for flows that must be resolved). */
  hideClose?: boolean;
}

export interface DialogProps extends OverlayBaseProps, VariantProps<typeof dialogPanelVariants> {}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  hideClose,
  size,
}: DialogProps) {
  useDismiss(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {/* Plain scrim. No blur here — the panel already blurs. */}
      <div
        className="absolute inset-0 bg-ink-strong/45 animate-glass-fade"
        onClick={onClose}
        aria-hidden
      />
      <div className={cn(dialogPanelVariants({ size }), className)}>
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div className="min-w-0">
              {title ? (
                <h2 className="font-heading text-lg font-semibold text-ink-strong">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-ink-body">{description}</p>
              ) : null}
            </div>
            {!hideClose && (
              <IconButton aria-label="Close" size="icon-sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        )}
        {children ? <div className="px-6 pb-5">{children}</div> : null}
        {footer ? (
          <div className="flex items-center justify-end gap-3 border-t border-glass-hairline px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export interface SheetProps extends OverlayBaseProps, VariantProps<typeof sheetPanelVariants> {}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  hideClose,
  side,
}: SheetProps) {
  useDismiss(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div
        className="absolute inset-0 bg-ink-strong/45 animate-glass-fade"
        onClick={onClose}
        aria-hidden
      />
      <div className={cn(sheetPanelVariants({ side }), className)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="min-w-0">
            {title ? (
              <h2 className="font-heading text-lg font-semibold text-ink-strong">{title}</h2>
            ) : null}
            {description ? <p className="mt-1 text-sm text-ink-body">{description}</p> : null}
          </div>
          {!hideClose && (
            <IconButton aria-label="Close" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          )}
        </div>
        {children ? <div className="scroll-region max-h-[70vh] px-6 pb-5">{children}</div> : null}
        {footer ? (
          <div className="border-t border-glass-hairline px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
