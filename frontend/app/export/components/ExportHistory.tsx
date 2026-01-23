import { formatDate } from '@/lib/utils/formatting';
import { Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Props {
  history: any[];
}

export default function ExportHistory({ history }: Props) {
  if (history.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="text-green-600" size={18} />;
      case 'failed':
        return <XCircle className="text-red-600" size={18} />;
      case 'partial_success':
        return <AlertCircle className="text-yellow-600" size={18} />;
      default:
        return <Download className="text-gray-600" size={18} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'partial_success':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b">
        <h3 className="font-semibold">Export History</h3>
      </div>

      <div className="divide-y">
        {history.map((record) => (
          <div key={record.id} className="px-6 py-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {getStatusIcon(record.status)}
                <div>
                  <p className="font-medium">
                    {record.export_type === 'qbo_api' ? 'QuickBooks Online' : 'CSV Export'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {record.successful_count} of {record.total_checks} checks exported
                  </p>
                  {record.failed_count > 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      {record.failed_count} failed
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                  {record.status.replace('_', ' ').toUpperCase()}
                </span>
                <p className="text-xs text-gray-500 mt-2">
                  {formatDate(record.created_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}