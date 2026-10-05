import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, Select } from '@/components/ui';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (count: number) => void;
}

/**
 * Lives inside the table's glass shell, so it carries no blur of its own.
 *
 * The per-page options are capability, not decoration: the grid must still be
 * able to show the whole 200-record view (and far more) on one page. Do not
 * trim this list to make the table feel faster.
 */
const PER_PAGE = [25, 50, 100, 200, 500, 1000, 2000];

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}) => {
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-glass-hairline px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs text-ink-body">
          Showing <span className="nums font-semibold text-ink-strong">{startIndex}</span> to{' '}
          <span className="nums font-semibold text-ink-strong">{endIndex}</span> of{' '}
          <span className="nums font-semibold text-ink-strong">{totalItems}</span> records
        </span>
        <Select
          inputSize="sm"
          aria-label="Records per page"
          className="nums w-auto"
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
        >
          {PER_PAGE.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton
          size="icon-sm"
          aria-label="Previous page"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={16} />
        </IconButton>

        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }

            const active = currentPage === pageNum;
            return (
              <button
                key={pageNum}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onPageChange(pageNum)}
                className={`press nums min-w-[2rem] rounded-full px-2.5 py-1 text-xs font-semibold ${
                  active
                    ? 'bg-brand text-white shadow-brand-glow'
                    : 'text-ink-body hover:bg-brand/[0.08] hover:text-ink-strong'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <IconButton
          size="icon-sm"
          aria-label="Next page"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight size={16} />
        </IconButton>
      </div>
    </div>
  );
};
