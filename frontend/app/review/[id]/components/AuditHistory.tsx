import { formatDate } from '@/lib/utils/formatting';
import { History } from 'lucide-react';

interface Props {
  logs: any[];
}

export default function AuditHistory({ logs }: Props) {
  if (logs.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <History size={18} className="text-gray-600" />
        <h3 className="font-semibold">Change History</h3>
      </div>

      <div className="divide-y max-h-96 overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="px-6 py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm capitalize">{log.action}</p>
                {log.field && (
                  <p className="text-sm text-gray-600 mt-1">
                    <span className="font-medium">{log.field}:</span>{' '}
                    {log.old_value && <span className="line-through">{log.old_value}</span>}
                    {log.old_value && log.new_value && ' → '}
                    {log.new_value && <span className="text-green-600">{log.new_value}</span>}
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500">{formatDate(log.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}