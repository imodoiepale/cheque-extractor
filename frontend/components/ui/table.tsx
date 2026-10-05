import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Table shell. The table IS the product, so this one has hard rules:
 *
 * 1. Glass goes on the CONTAINER and the STICKY HEADER, never on individual
 *    rows. The comparison grid renders hundreds of rows and each blurred
 *    element is its own compositing layer.
 * 2. Row height does not change. The premium look costs no rows on screen.
 * 3. One scrollbar per page — the table scrolls inside `TableScroll`, which
 *    sets `overscroll-behavior-y: contain` so rubber-banding does not chain
 *    to the frame.
 * 4. Amounts are tabular-nums and right-aligned. Use `<Th numeric>` / `<Td
 *    numeric>`, which is the ONE <th> recipe replacing the five that existed.
 */

export const tableShellVariants = cva('overflow-hidden rounded-card', {
  variants: {
    tier: {
      /** Default: the table lives in its own glass card. */
      glass: 'glass-card p-0',
      /** The table is already inside a GlassCard — do not blur twice. */
      inset: 'border border-glass-hairline bg-white/55',
    },
  },
  defaultVariants: { tier: 'glass' },
});

export interface TableShellProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tableShellVariants> {}

export const TableShell = React.forwardRef<HTMLDivElement, TableShellProps>(
  ({ className, tier, ...props }, ref) => (
    <div ref={ref} className={cn(tableShellVariants({ tier }), className)} {...props} />
  )
);
TableShell.displayName = 'TableShell';

/** The one scroll container. Give it an explicit max height. */
export const TableScroll = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('scroll-region relative', className)} {...props} />
  )
);
TableScroll.displayName = 'TableScroll';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn('w-full border-separate border-spacing-0 text-sm', className)}
      {...props}
    />
  )
);
Table.displayName = 'Table';

/** Sticky, blurred, and the only place in the table that is glass. */
export const Thead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('sticky top-0 z-10 glass-chrome', className)} {...props} />
));
Thead.displayName = 'Thead';

export const Tbody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />);
Tbody.displayName = 'Tbody';

export const trVariants = cva(
  'transition-[background-color,box-shadow] duration-quick ease-settle',
  {
    variants: {
      interactive: {
        true: 'cursor-pointer hover:bg-brand/[0.045]',
        false: '',
      },
      /* Selected rows get denser, not lighter, and must never move text —
         no border-width change, no padding change. */
      selected: {
        true: 'bg-brand/[0.08]',
        false: '',
      },
      state: {
        none: '',
        success: 'bg-success-bg/35',
        warning: 'bg-warning-bg/35',
        error: 'bg-error-bg/35',
      },
    },
    defaultVariants: { interactive: false, selected: false, state: 'none' },
  }
);

export interface TrProps
  extends React.HTMLAttributes<HTMLTableRowElement>,
    VariantProps<typeof trVariants> {}

export const Tr = React.forwardRef<HTMLTableRowElement, TrProps>(
  ({ className, interactive, selected, state, ...props }, ref) => (
    <tr
      ref={ref}
      aria-selected={selected || undefined}
      className={cn(trVariants({ interactive, selected, state }), className)}
      {...props}
    />
  )
);
Tr.displayName = 'Tr';

/** The single <th> recipe. Uppercase, tracked, hairline underline. */
export const thVariants = cva(
  [
    'border-b border-glass-hairline px-4 py-2.5',
    'text-eyebrow text-ink-faint',
    'bg-transparent',
  ].join(' '),
  {
    variants: {
      numeric: { true: 'nums text-right', false: 'text-left' },
      sortable: {
        true: 'cursor-pointer select-none hover:text-ink-body',
        false: '',
      },
    },
    defaultVariants: { numeric: false, sortable: false },
  }
);

export interface ThProps
  extends React.ThHTMLAttributes<HTMLTableCellElement>,
    VariantProps<typeof thVariants> {}

export const Th = React.forwardRef<HTMLTableCellElement, ThProps>(
  ({ className, numeric, sortable, ...props }, ref) => (
    <th
      ref={ref}
      scope="col"
      className={cn(thVariants({ numeric, sortable }), className)}
      {...props}
    />
  )
);
Th.displayName = 'Th';

/* Row height is set here and nowhere else: py-3 at text-sm, unchanged from
   the pre-redesign tables. Do not raise it to make the glass "breathe". */
export const tdVariants = cva('border-b border-glass-hairline px-4 py-3 text-ink-strong', {
  variants: {
    numeric: { true: 'nums text-right', false: 'text-left' },
    muted: { true: 'text-ink-faint', false: '' },
  },
  defaultVariants: { numeric: false, muted: false },
});

export interface TdProps
  extends React.TdHTMLAttributes<HTMLTableCellElement>,
    VariantProps<typeof tdVariants> {}

export const Td = React.forwardRef<HTMLTableCellElement, TdProps>(
  ({ className, numeric, muted, ...props }, ref) => (
    <td ref={ref} className={cn(tdVariants({ numeric, muted }), className)} {...props} />
  )
);
Td.displayName = 'Td';

/** Empty state inside the table shell, so it never collapses to zero height. */
export function TableEmpty({
  colSpan,
  title,
  description,
  action,
}: {
  colSpan: number;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        <p className="font-heading text-base font-semibold text-ink-strong">{title}</p>
        {description ? <p className="mt-1 text-sm text-ink-body">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </td>
    </tr>
  );
}
