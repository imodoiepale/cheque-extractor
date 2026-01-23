'use client';

import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface FieldConfidence {
  field: string;
  ocrConfidence: number;
  aiConfidence: number;
  selectedSource: 'ocr' | 'ai';
  finalConfidence: number;
}

interface Props {
  fields: FieldConfidence[];
}

export default function ConfidenceMatrix({ fields }: Props) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-50';
    if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircle size={16} />;
    if (confidence >= 0.7) return <AlertTriangle size={16} />;
    return <XCircle size={16} />;
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Confidence Matrix</h3>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium text-gray-700">Field</th>
              <th className="text-center py-2 px-3 font-medium text-gray-700">OCR</th>
              <th className="text-center py-2 px-3 font-medium text-gray-700">AI</th>
              <th className="text-center py-2 px-3 font-medium text-gray-700">Selected</th>
              <th className="text-center py-2 px-3 font-medium text-gray-700">Final</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((field, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="py-3 px-3 font-medium text-gray-900 capitalize">
                  {field.field.replace(/_/g, ' ')}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(field.ocrConfidence)}`}>
                    {(field.ocrConfidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(field.aiConfidence)}`}>
                    {(field.aiConfidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="text-xs font-medium text-blue-600 uppercase">
                    {field.selectedSource}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getConfidenceColor(field.finalConfidence)}`}>
                    {getConfidenceIcon(field.finalConfidence)}
                    {(field.finalConfidence * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300"></div>
          <span>High (&gt;90%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></div>
          <span>Medium (70-90%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div>
          <span>Low (&lt;70%)</span>
        </div>
      </div>
    </div>
  );
}
