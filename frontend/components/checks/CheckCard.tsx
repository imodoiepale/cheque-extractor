import Link from 'next/link';
import { Calendar, DollarSign, Building2, FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';

interface Check {
  id: string;
  check_number?: string;
  payee?: string;
  amount?: number;
  check_date?: string;
  bank_name?: string;
  status: string;
  confidence_summary?: number;
  file_url?: string;
}

interface Props {
  check: Check;
}

export default function CheckCard({ check }: Props) {
  return (
    <Link href={`/review/${check.id}`}>
      <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 cursor-pointer border border-gray-200 hover:border-blue-300">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="text-gray-400" size={20} />
              <h3 className="font-semibold text-gray-900">
                Check #{check.check_number || 'N/A'}
              </h3>
            </div>
            <StatusBadge status={check.status} />
          </div>
          {check.confidence_summary !== undefined && (
            <div className="text-right">
              <div className="text-xs text-gray-500 mb-1">Confidence</div>
              <div className={`text-lg font-bold ${
                check.confidence_summary >= 0.9 ? 'text-green-600' :
                check.confidence_summary >= 0.7 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {(check.confidence_summary * 100).toFixed(0)}%
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {check.payee && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="text-gray-400" size={16} />
              <span className="text-gray-600">Payee:</span>
              <span className="font-medium text-gray-900">{check.payee}</span>
            </div>
          )}
          
          {check.amount !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="text-gray-400" size={16} />
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium text-gray-900">
                ${check.amount.toFixed(2)}
              </span>
            </div>
          )}
          
          {check.check_date && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="text-gray-400" size={16} />
              <span className="text-gray-600">Date:</span>
              <span className="font-medium text-gray-900">
                {new Date(check.check_date).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {check.file_url && (
          <div className="mt-4 pt-4 border-t">
            <img
              src={check.file_url}
              alt="Check preview"
              className="w-full h-24 object-cover rounded"
            />
          </div>
        )}
      </div>
    </Link>
  );
}
