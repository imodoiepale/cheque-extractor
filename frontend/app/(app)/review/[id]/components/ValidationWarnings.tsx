import { AlertTriangle, XCircle } from 'lucide-react';

interface Props {
  errors: any[];
  warnings: any[];
}

/**
 * Validation callouts. Flat tinted panels, not glass: they are state marks,
 * and glass stays neutral (rule 10). No blur here either — there can be one
 * per failed field, and blur must not scale with the list.
 */
export default function ValidationWarnings({ errors, warnings }: Props) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {errors.map((error, index) => (
        <div key={`error-${index}`} className="rounded-card border border-error-border bg-error-bg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 shrink-0 text-error-text" size={20} />
            <div>
              <p className="font-medium text-error-text">{error.field}</p>
              <p className="mt-1 text-sm text-error-text/90">{error.message}</p>
            </div>
          </div>
        </div>
      ))}

      {warnings.map((warning, index) => (
        <div key={`warning-${index}`} className="rounded-card border border-warning-border bg-warning-bg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-warning-text" size={20} />
            <div>
              <p className="font-medium text-warning-text">{warning.field}</p>
              <p className="mt-1 text-sm text-warning-text/90">{warning.message}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
