import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { FileSearch } from 'lucide-react';
import { EmptyState, buttonVariants } from '@/components/ui';
import CheckImageViewer from './components/CheckImageViewer';
import FieldEditor from './components/FieldEditor';
import ApprovalActions from './components/ApprovalActions';
import ComparisonPanel from './components/ComparisonPanel';
import ValidationWarnings from './components/ValidationWarnings';
import AuditHistory from './components/AuditHistory';

// Next 16: route params are a Promise. Reading `params.id` synchronously gave
// `undefined`, so every review silently bounced to the dashboard.
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: check, error } = await supabase
    .from('checks')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  // A real query failure goes to the (app) error boundary, which has a retry.
  if (error) throw error;
  if (!check) {
    return (
      <div className="mx-auto max-w-xl p-6" data-tone="brand">
        <EmptyState
          icon={<FileSearch />}
          title="This cheque isn’t here"
          description="It may have been deleted, or it belongs to another company. Pick a document from your dashboard to keep reviewing."
          action={<Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>Back to dashboard</Link>}
        />
      </div>
    );
  }

  // Get audit logs
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('check_id', id)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6" data-tone="brand">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-ink-strong">Review Check</h1>
          <p className="nums mt-1 text-sm text-ink-body">Check #{check.check_number || 'N/A'}</p>
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
