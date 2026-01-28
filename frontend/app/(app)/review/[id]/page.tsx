import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CheckImageViewer from './components/CheckImageViewer';
import FieldEditor from './components/FieldEditor';
import ApprovalActions from './components/ApprovalActions';
import ComparisonPanel from './components/ComparisonPanel';
import ValidationWarnings from './components/ValidationWarnings';
import AuditHistory from './components/AuditHistory';

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: check, error } = await supabase
    .from('checks')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !check) {
    redirect('/dashboard');
  }

  // Get audit logs
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('check_id', params.id)
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Check</h1>
          <p className="text-gray-600 mt-1">Check #{check.check_number || 'N/A'}</p>
        </div>
        <ApprovalActions checkId={check.id} currentStatus={check.status} />
      </div>

      {/* Validation Warnings */}
      {check.validation_errors && check.validation_errors.length > 0 && (
        <ValidationWarnings 
          errors={check.validation_errors}
          warnings={check.validation_warnings || []}
        />
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Image */}
        <div className="space-y-6">
          <CheckImageViewer imageUrl={check.file_url} />
          
          {/* OCR vs AI Comparison */}
          <ComparisonPanel 
            ocrResults={check.ocr_results}
            aiResults={check.ai_results}
          />
        </div>

        {/* Right Column - Fields */}
        <div className="space-y-6">
          <FieldEditor check={check} />
          
          {/* Audit History */}
          {auditLogs && auditLogs.length > 0 && (
            <AuditHistory logs={auditLogs} />
          )}
        </div>
      </div>
    </div>
  );
}