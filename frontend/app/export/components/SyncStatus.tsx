import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils/formatting';

interface Props {
  connection: any;
}

export default function SyncStatus({ connection }: Props) {
  if (!connection) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-yellow-900">QuickBooks Not Connected</p>
            <p className="text-sm text-yellow-700 mt-1">
              Connect your QuickBooks Online account to enable automatic syncing
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isExpiringSoon = new Date(connection.access_token_expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000);

  return (
    <div className={`border rounded-lg p-4 ${
      connection.status === 'active' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-start gap-3">
        {connection.status === 'active' ? (
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
        ) : (
          <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        )}
        <div className="flex-1">
          <p className="font-medium text-gray-900">
            QuickBooks Online {connection.status === 'active' ? 'Connected' : 'Disconnected'}
          </p>
          <p className="text-sm text-gray-700 mt-1">
            Realm ID: {connection.realm_id}
          </p>
          {isExpiringSoon && (
            <p className="text-sm text-yellow-700 mt-2">
              ⚠️ Token expires soon. Please reconnect.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Connected on {formatDate(connection.created_at)}
          </p>
        </div>
      </div>
    </div>
  );
}