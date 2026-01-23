'use client';

import { useState } from 'react';
import { formatCurrency, formatConfidence } from '@/lib/utils/formatting';

interface Props {
  ocrResults: any;
  aiResults: any;
}

export default function ComparisonPanel({ ocrResults, aiResults }: Props) {
  const [showComparison, setShowComparison] = useState(false);

  if (!ocrResults || !aiResults) return null;

  const fields = ['payee', 'amount', 'check_date', 'check_number'];

  return (
    <div className="bg-white rounded-lg shadow">
      <button
        onClick={() => setShowComparison(!showComparison)}
        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50"
      >
        <h3 className="font-semibold">OCR vs AI Comparison</h3>
        <span className="text-sm text-gray-500">
          {showComparison ? 'Hide' : 'Show'}
        </span>
      </button>

      {showComparison && (
        <div className="px-6 pb-6 space-y-4">
          {fields.map(field => {
            const ocrField = ocrResults[field];
            const aiField = aiResults[field];

            if (!ocrField && !aiField) return null;

            return (
              <div key={field} className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3 capitalize">
                  {field.replace('_', ' ')}
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* OCR */}
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-blue-600 font-medium mb-1">OCR</p>
                    <p className="font-medium">{ocrField?.value || 'N/A'}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {formatConfidence(ocrField?.confidence || 0)}
                    </p>
                  </div>

                  {/* AI */}
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-xs text-purple-600 font-medium mb-1">AI</p>
                    <p className="font-medium">{aiField?.value || 'N/A'}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {formatConfidence(aiField?.confidence || 0)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}