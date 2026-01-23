import Link from 'next/link';
import { Check } from '@/types/check';
import StatusBadge from './StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils/formatting';
import { Eye } from 'lucide-react';

interface Props {
  checks: Check[];
}

export default function CheckList({ checks }: Props) {
  if (checks.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        No checks found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Payee
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Check #
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Confidence
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {checks.map((check) => (
            <tr key={check.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <p className="font-medium">{check.payee || 'N/A'}</p>
              </td>
              <td className="px-6 py-4">
                {check.amount ? formatCurrency(check.amount) : 'N/A'}
              </td>
              <td className="px-6 py-4">
                {check.check_date ? formatDate(check.check_date) : 'N/A'}
              </td>
              <td className="px-6 py-4">
                {check.check_number || 'N/A'}
              </td>
              <td className="px-6 py-4">
                <StatusBadge status={check.status} />
              </td>
              <td className="px-6 py-4">
                {check.confidence_summary 
                  ? `${(check.confidence_summary * 100).toFixed(0)}%`
                  : 'N/A'
                }
              </td>
              <td className="px-6 py-4">
                <Link
                  href={`/review/${check.id}`}
                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Eye size={16} />
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}