import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { DateFormat, DATE_FORMAT_OPTIONS } from '../utils/comparisonUtils';

/**
 * The page's rarely-used chrome, behind one glyph.
 *
 * Holds the date-display preference and "Delete All QB Data" — destructive, so
 * it does not belong next to Refresh and Export as a red button. The
 * confirmation modal it opens is unchanged.
 *
 * The menu surface is deliberately OPAQUE (`bg-surface`): it opens over the
 * blurred header card, and two blurred surfaces stacked go muddy.
 */
const MENU =
  'absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-input border border-glass-hairline bg-surface shadow-glass-modal animate-popover-in';

const ITEM =
  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-ink-body transition-colors duration-tap hover:bg-brand/[0.06] hover:text-ink-strong';

interface HeaderOverflowMenuProps {
  dateFormat: DateFormat;
  setDateFormat: (fmt: DateFormat) => void;
  /** Omitted when there is no QB data to delete. */
  onDeleteAll?: () => void;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  dateFormat,
  setDateFormat,
  onDeleteAll,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <IconButton
        size="icon-sm"
        aria-label="More options"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={16} />
      </IconButton>

      {open && (
        <div className={MENU}>
          <p className="px-3 pb-1 pt-2 text-eyebrow text-ink-faint">Date format</p>
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setDateFormat(opt.value);
                setOpen(false);
              }}
              className={`${ITEM} ${
                dateFormat === opt.value ? 'bg-brand/[0.08] font-semibold text-brand-deep' : ''
              }`}
            >
              <span>{opt.label}</span>
              <span className="nums text-ink-faint">{opt.example}</span>
            </button>
          ))}

          {onDeleteAll && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDeleteAll();
              }}
              className={`${ITEM} border-t border-glass-hairline text-error-text`}
            >
              <span className="flex items-center gap-2">
                <Trash2 size={14} aria-hidden />
                Delete all QB data
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
