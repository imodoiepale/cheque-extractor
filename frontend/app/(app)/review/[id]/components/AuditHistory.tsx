import { formatDate } from '@/lib/utils/formatting';
import { History } from 'lucide-react';
import { GlassCard, GlassCardTitle } from '@/components/ui';

interface Props {
  logs: any[];
}

export default function AuditHistory({ logs }: Props) {
  if (logs.length === 0) return null;

  return (
    // ONE blurred surface. The log rows are plain hairline-divided rows —
    // a blur per row is a compositing layer per row.
    <GlassCard padding="none" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-glass-hairline px-6 py-4">
        <History size={18} className="text-ink-faint" />
        <GlassCardTitle className="text-base">Change History</GlassCardTitle>
      </div>

      <div className="scroll-region max-h-96">
        {logs.map((log) => (
          <div key={log.id} className="border-b border-glass-hairline px-6 py-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize text-ink-strong">{log.action}</p>
                {log.field && (
                  <p className="mt-1 text-sm text-ink-body">
                    <span className="font-medium">{log.field}:</span>{' '}
                    {log.old_value && <span className="text-ink-faint line-through">{log.old_value}</span>}
                    {log.old_value && log.new_value && ' → '}
                    {log.new_value && <span className="text-success-text">{log.new_value}</span>}
                  </p>
                )}
              </div>
              <p className="nums shrink-0 text-xs text-ink-faint">{formatDate(log.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
