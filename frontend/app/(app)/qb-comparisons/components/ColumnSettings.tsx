import React from 'react';
import { Button, Dialog, GlassPanel } from '@/components/ui';
import { VisibleColumns } from '../hooks/useComparisonState';

interface ColumnSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: VisibleColumns;
  setVisibleColumns: (columns: VisibleColumns) => void;
}

const COLUMNS: { key: keyof VisibleColumns; label: string }[] = [
  { key: 'checkNumber', label: 'Check Number' },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'payee', label: 'Payee' },
  { key: 'bankAccount', label: 'Bank/Account' },
  { key: 'memo', label: 'Memo' },
  { key: 'source', label: 'Source' },
  { key: 'matchStatus', label: 'Match Status' },
  { key: 'issues', label: 'Issues' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'qbSource', label: 'QB Transaction Source' },
  { key: 'qbType', label: 'QB Transaction Type' },
  { key: 'currency', label: 'Currency' },
  { key: 'pdfName', label: 'PDF Document Name' },
  { key: 'actions', label: 'Actions' },
];

export const ColumnSettings: React.FC<ColumnSettingsProps> = ({
  isOpen,
  onClose,
  visibleColumns,
  setVisibleColumns,
}) => (
  <Dialog
    open={isOpen}
    onClose={onClose}
    size="sm"
    title="Column Settings"
    description="Choose which columns the comparison grid shows."
    footer={
      <>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setVisibleColumns(
              Object.keys(visibleColumns).reduce(
                (acc, key) => ({ ...acc, [key]: true }),
                {} as VisibleColumns
              )
            )
          }
        >
          Show All
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </>
    }
  >
    <GlassPanel padding="none" radius="input" className="scroll-region max-h-[55vh] p-1.5">
      {COLUMNS.map((col) => (
        <label
          key={col.key}
          className="flex cursor-pointer items-center gap-3 rounded-input px-3 py-2 transition-colors duration-tap hover:bg-brand/[0.06]"
        >
          <input
            type="checkbox"
            checked={visibleColumns[col.key]}
            onChange={(e) =>
              setVisibleColumns({ ...visibleColumns, [col.key]: e.target.checked })
            }
            className="h-4 w-4 rounded border-glass-hairline"
          />
          <span className="text-sm font-medium text-ink-body">{col.label}</span>
        </label>
      ))}
    </GlassPanel>
  </Dialog>
);
