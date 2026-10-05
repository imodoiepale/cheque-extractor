import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Button — pills. 9999px radius, 3rem min-height, inline-flex centred,
 * 0.5rem gap. Press is scale(0.96) at 120ms; disabled is opacity 0.45.
 *
 * `transition-property` is enumerated, never `all`: transitioning `all` on a
 * glass surface animates the backdrop filter and tanks the frame rate.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full',
    'font-sans font-semibold select-none',
    'transition-[transform,box-shadow,background-color,border-color,color,opacity]',
    'duration-tap ease-settle',
    'enabled:active:scale-press',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:opacity-disabled',
  ].join(' '),
  {
    variants: {
      variant: {
        /** 90-degree indigo gradient + coloured lift. */
        primary:
          'bg-gradient-to-r from-brand to-brand-dark text-white border border-brand-dark/40 shadow-brand-glow hover:from-brand-light hover:to-brand',
        /** Light glass pill. The default for anything that is not the one action. */
        secondary:
          'glass-card text-ink-strong hover:bg-white/85 shadow-contact',
        /** Hairline pill over a faint tint, with its own light blur. */
        ghost:
          'border border-ink-strong/[0.14] bg-ink-strong/[0.035] text-ink-body backdrop-blur-[8px] hover:bg-ink-strong/[0.07] hover:text-ink-strong',
        /** Commit-to-destroy. Never the default in a confirmation. */
        destructive:
          'bg-gradient-to-r from-error to-error-dark text-white border border-error-dark/40 shadow-danger-glow hover:from-error-dark hover:to-error-dark',
        /** Text-only affordance inside dense chrome. */
        link: 'text-brand-deep underline-offset-2 hover:underline',
      },
      size: {
        /** Spec default: min-height 3rem. */
        md: 'min-h-btn px-5 text-sm',
        lg: 'min-h-[3.25rem] px-7 text-base',
        /** Dense chrome. Still clears the 44px tap target. */
        sm: 'min-h-tap px-4 text-sm',
        /** 42px circle, scale(0.95) on press. */
        icon: 'h-[42px] w-[42px] p-0 enabled:active:scale-press-sm',
        'icon-sm': 'h-9 w-9 p-0 enabled:active:scale-press-sm',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Swaps the leading icon for a spinner in a fixed-width slot, so the
   *  button never reflows. Also disables the button. */
  loading?: boolean;
  /** Leading icon. Lives in the same fixed slot as the spinner. */
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, icon, children, disabled, ...props }, ref) => {
    const slot = loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon;
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      >
        {/* Fixed-width slot: loading and success are icon swaps, not reflows. */}
        {slot ? (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{slot}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

/** Icon-only button. 42px circle, same hairline, press scale(0.95). */
export interface IconButtonProps extends Omit<ButtonProps, 'size' | 'icon' | 'children'> {
  'aria-label': string;
  children: React.ReactNode;
  size?: 'icon' | 'icon-sm';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'icon', variant = 'ghost', ...props }, ref) => (
    <Button ref={ref} size={size} variant={variant} {...props} />
  )
);
IconButton.displayName = 'IconButton';
