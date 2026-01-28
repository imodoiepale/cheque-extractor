import { AlertTriangle, XCircle } from 'lucide-react';

interface Props {
  errors: any[];
  warnings: any[];
}

export default function ValidationWarnings({ errors, warnings }: Props) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Errors */}
      {errors.map((error, index) => (
        <div key={`error-${index}`} className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <XCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-red-900">{error.field}</p>
              <p className="text-sm text-red-700 mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      ))}

      {/* Warnings */}
      {warnings.map((warning, index) => (
        <div key={`warning-${index}`} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-yellow-900">{warning.field}</p>
              <p className="text-sm text-yellow-700 mt-1">{warning.message}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}