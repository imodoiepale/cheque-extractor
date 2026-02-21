import React from 'react';
import { X, Settings } from 'lucide-react';
import { VisibleColumns } from '../hooks/useComparisonState';

interface ColumnSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns: VisibleColumns;
  setVisibleColumns: (columns: VisibleColumns) => void;
}

export const ColumnSettings: React.FC<ColumnSettingsProps> = ({
  isOpen,
  onClose,
  visibleColumns,
  setVisibleColumns,
}) => {
  if (!isOpen) return null;

  const columns = [
    { key: 'checkNumber', label: 'Check Number' },
    { key: 'date', label: 'Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'payee', label: 'Payee' },
    { key: 'bankAccount', label: 'Bank/Account' },
    { key: 'memo', label: 'Memo' },
    { key: 'source', label: 'Source' },
    { key: 'matchStatus', label: 'Match Status' },
    { key: 'confidence', label: 'Confidence' },
    { key: 'qbSource', label: 'QB Source' },
    { key: 'actions', label: 'Actions' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-96 max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2">
            <Settings size={20} />
            <h3 className="text-lg font-bold">Column Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition"
            >
              <input
                type="checkbox"
                checked={visibleColumns[col.key as keyof VisibleColumns]}
                onChange={(e) =>
                  setVisibleColumns({
                    ...visibleColumns,
                    [col.key]: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">{col.label}</span>
            </label>
          ))}
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 rounded-b-xl">
          <button
            onClick={() => {
              const allVisible = Object.keys(visibleColumns).reduce((acc, key) => ({
                ...acc,
                [key]: true,
              }), {} as VisibleColumns);
              setVisibleColumns(allVisible);
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Show All
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
