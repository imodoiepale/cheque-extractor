import React from 'react';
import { FileText, CheckCircle, AlertCircle, FileCheck, XCircle } from 'lucide-react';

interface StatisticsPanelProps {
  total: number;
  matched: number;
  mismatched: number;
  missingInQB: number;
  missingInExtraction: number;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  total,
  matched,
  mismatched,
  missingInQB,
  missingInExtraction,
}) => {
  const stats = [
    { label: 'Total Records', value: total, icon: FileText, bg: 'bg-gray-50', color: 'text-gray-600' },
    { label: 'Matched', value: matched, icon: CheckCircle, bg: 'bg-emerald-50', color: 'text-emerald-600' },
    { label: 'Mismatched', value: mismatched, icon: AlertCircle, bg: 'bg-amber-50', color: 'text-amber-600' },
    { label: 'Missing in QB', value: missingInQB, icon: FileCheck, bg: 'bg-blue-50', color: 'text-blue-600' },
    { label: 'Missing in Extraction', value: missingInExtraction, icon: XCircle, bg: 'bg-red-50', color: 'text-red-600' },
  ];

  return (
    <div className="px-3 py-2 bg-white border-b border-gray-200">
      <div className="grid grid-cols-5 gap-2 mb-2">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-2 flex items-center gap-2 shadow-sm hover:shadow transition">
            <div className={`p-1.5 rounded-md ${stat.bg}`}>
              <stat.icon size={14} className={stat.color} />
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">{stat.label}</p>
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
        <span className="font-semibold text-blue-700">QB Data Source:</span> Configure QuickBooks connection in{' '}
        <a href="/settings" className="text-blue-600 hover:underline font-semibold">Settings → Integrations</a>
      </div>
    </div>
  );
};
