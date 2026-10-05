import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * GlassCard — the load-bearing surface.
 *
 * One blur tier per depth (rule 2). `tier` picks the tier; never put a `card`
 * tier inside another `card` tier, use GlassPanel for the inner group.
 *
 * The blur, the light border, the inset top highlight and the saturate() are
 * declared together in `.glass-card` (globals.css) so the `@supports` and
 * `prefers-reduced-transparency` fallbacks travel with them.
 */
export const glassCardVariants = cva(
  'relative rounded-card text-ink-strong transition-[box-shadow,transform,background-color,border-color] duration-settle ease-settle',
  {
    variants: {
      tier: {
        /** Cards, list groups. blur(18px) saturate(120%) @ 0.72 */
        card: 'glass-card',
        /** Over photos or bright artwork. blur(28px) saturate(150%) */
        bright: 'glass-card glass-card-bright',
        /** Modals, popovers, sheets. blur(24px) saturate(150%) @ 0.92 */
        modal: 'glass-modal rounded-modal',
        /** Shell chrome and sticky headers. blur(26px) saturate(160%) @ 0.70 */
        chrome: 'glass-chrome',
        /** Toasts. blur(30px) saturate(180%) @ 0.80 */
        toast: 'glass-toast',
        /** The dark shell (sidebar). Same technique, dark substrate. */
        shell: 'glass-shell text-shell-text',
        /** Inner group. No blur of its own — never nest two blurred surfaces. */
        panel: 'glass-panel',
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-5',
        lg: 'p-6',
      },
      interactive: {
        true: 'press hover-lift cursor-pointer focus-visible:outline-none',
        false: '',
      },
      selected: {
        /* Denser, never lighter. Border width inherited, never changed. */
        true: 'glass-selected',
        false: '',
      },
    },
    defaultVariants: {
      tier: 'card',
      padding: 'md',
      interactive: false,
      selected: false,
    },
  }
);

export interface GlassCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof glassCardVariants> {
  /** Render the entrance animation (CSS keyframes, not a JS tween). */
  reveal?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, tier, padding, interactive, selected, reveal, ...props }, ref) => (
    <div
      ref={ref}
      data-selected={selected ? '' : undefined}
      className={cn(
        glassCardVariants({ tier, padding, interactive, selected }),
        reveal && 'animate-glass-rise',
        className
      )}
      {...props}
    />
  )
);
GlassCard.displayName = 'GlassCard';

/**
 * GlassPanel — an inset-grouped sub-surface for use *inside* a GlassCard.
 * Carries no backdrop-filter, because two blurred surfaces stacked directly
 * double-composite and both go muddy.
 */
export const glassPanelVariants = cva('relative text-ink-strong', {
  variants: {
    tone: {
      neutral: 'glass-panel',
      sunken: 'glass-track',
      plain: 'bg-surface/60 border border-glass-hairline',
    },
    radius: {
      card: 'rounded-card',
      tile: 'rounded-tile',
      input: 'rounded-input',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5',
    },
  },
  defaultVariants: { tone: 'neutral', radius: 'tile', padding: 'md' },
});

export interface GlassPanelProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof glassPanelVariants> {}

export const GlassPanel = React.forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, tone, radius, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(glassPanelVariants({ tone, radius, padding }), className)}
      {...props}
    />
  )
);
GlassPanel.displayName = 'GlassPanel';

/* --- Card sub-parts, so every card header looks the same ------------------ */

export const GlassCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-start justify-between gap-3', className)} {...props} />
));
GlassCardHeader.displayName = 'GlassCardHeader';

export const GlassCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-heading text-lg font-semibold text-ink-strong', className)}
    {...props}
  />
));
GlassCardTitle.displayName = 'GlassCardTitle';

/** Caption for an inset group: uppercase, tracked +0.16em, not sentence-case. */
export const GlassCardEyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-eyebrow text-ink-faint', className)} {...props} />
));
GlassCardEyebrow.displayName = 'GlassCardEyebrow';

/** Body copy over glass stays full strength — translucency eats contrast. */
export const GlassCardBody = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-ink-body', className)} {...props} />
));
GlassCardBody.displayName = 'GlassCardBody';
