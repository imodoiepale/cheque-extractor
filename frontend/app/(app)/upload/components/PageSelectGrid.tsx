'use client';

/**
 * Per-page selection for the Configure step.
 *
 * Billing counts cheques, not pages, so selection has to be explicit: one
 * toggle per page, pre-checked only where detection found cheques. A 40-page
 * bank statement stays dense — fixed-width tiles in an auto-fill grid that
 * scrolls inside the card rather than growing the page.
 */

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SelectablePage = { page_number: number; checks_on_page: number };

interface PageSelectGridProps {
  pages: SelectablePage[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  disabled?: boolean;
}

/** Contiguous = the selection is a single unbroken run of page numbers. */
export function isContiguous(selected: Set<number>): boolean {
  if (selected.size === 0) return false;
  const sorted = [...selected].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0] + 1 === sorted.length;
}

export function selectedRange(selected: Set<number>): { from: number; to: number } {
  const sorted = [...selected].sort((a, b) => a - b);
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

/** Pages where detection found at least one cheque — the sensible default. */
export function defaultPageSelection(pages: SelectablePage[]): Set<number> {
  const detected = pages.filter((p) => p.checks_on_page > 0).map((p) => p.page_number);
  // Nothing detected: fall back to every page so the user is never stuck with
  // an empty selection they cannot start from.
  return new Set(detected.length > 0 ? detected : pages.map((p) => p.page_number));
}

export default function PageSelectGrid({
  pages,
  selected,
  onChange,
  disabled,
}: PageSelectGridProps) {
  const toggle = (pageNumber: number) => {
    const next = new Set(selected);
    if (next.has(pageNumber)) next.delete(pageNumber);
    else next.add(pageNumber);
    onChange(next);
  };

  const selectedCheques = pages.reduce(
    (sum, p) => (selected.has(p.page_number) ? sum + p.checks_on_page : sum),
    0
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nums text-[11px] text-ink-body">
          <span className="font-medium text-ink-strong">{selected.size}</span> of {pages.length}{' '}
          page{pages.length === 1 ? '' : 's'} ·{' '}
          <span className="font-medium text-ink-strong">{selectedCheques}</span> cheque
          {selectedCheques === 1 ? '' : 's'} selected
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="link"
            disabled={disabled}
            onClick={() => onChange(new Set(pages.map((p) => p.page_number)))}
          >
            Select all
          </Button>
          <span aria-hidden className="text-[10px] text-ink-faint">
            ·
          </span>
          <Button
            size="sm"
            variant="link"
            disabled={disabled}
            onClick={() => onChange(defaultPageSelection(pages))}
          >
            Detected only
          </Button>
          <span aria-hidden className="text-[10px] text-ink-faint">
            ·
          </span>
          <Button size="sm" variant="link" disabled={disabled} onClick={() => onChange(new Set())}>
            Select none
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Pages to extract"
        className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1.5 overflow-y-auto pr-0.5"
      >
        {pages.map((page) => {
          const isSelected = selected.has(page.page_number);
          return (
            <button
              key={page.page_number}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`Page ${page.page_number}, ${page.checks_on_page} cheque${
                page.checks_on_page === 1 ? '' : 's'
              } detected`}
              disabled={disabled}
              onClick={() => toggle(page.page_number)}
              className={cn(
                'press glass-panel relative rounded-input px-1.5 py-1.5 text-center',
                'transition-[box-shadow,border-color,background-color] duration-quick ease-settle',
                'disabled:pointer-events-none disabled:opacity-disabled',
                isSelected && 'glass-selected'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute right-1 top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full border-[1.5px]',
                  isSelected ? 'border-brand bg-brand' : 'border-ink-faint/50'
                )}
              >
                {isSelected && <Check size={6} className="text-ink-invert" />}
              </span>
              <span className="nums block text-[11px] font-medium text-ink-strong">
                {page.page_number}
              </span>
              <span
                className={cn(
                  'nums block text-[9px]',
                  page.checks_on_page > 0 ? 'text-ink-body' : 'text-ink-faint'
                )}
              >
                {page.checks_on_page > 0 ? `${page.checks_on_page} chq` : 'none'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
