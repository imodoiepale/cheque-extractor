import { createClient } from '@/lib/supabase/server';
import ExportQueue from './components/ExportQueue';
import QBOAuthButton from './components/QBOAuthButton';
import ExportHistory from './components/ExportHistory';
import SyncStatus from './components/SyncStatus';

export default async function ExportPage() {
  const supabase = await createClient();

  // Get approved checks ready for export
  const { data: approvedChecks } = await supabase
    .from('checks')
    .select('*')
    .eq('status', 'approved')
    .eq('exported', false)
    .order('created_at', { ascending: false });

  // Get export history
  const { data: exportHistory } = await supabase
    .from('export_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  // Get QBO connection status
  const { data: qboConnection } = await supabase
    .from('qbo_connections')
    .select('*')
    .eq('status', 'active')
    .single();

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Export Checks</h1>
          <p className="text-gray-600 mt-1">Export approved checks to QuickBooks Online</p>
        </div>
        <QBOAuthButton isConnected={!!qboConnection} />
      </div>

      {/* Connection Status */}
      <SyncStatus connection={qboConnection} />

      {/* Export Queue */}
      <ExportQueue 
        checks={approvedChecks || []}
        hasConnection={!!qboConnection}
      />

      {/* Export History */}
      <ExportHistory history={exportHistory || []} />
    </div>
  );
}