'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatConfidence } from '@/lib/utils/formatting';

interface Props {
  checkId: string;
}

export default function ExtractionComparison({ checkId }: Props) {
  const [check, setCheck] = useState<any>(null);

  useEffect(() => {
    const loadCheck = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('checks')
        .select('*')
        .eq('id', checkId)
        .single();

      setCheck(data);
    };

    loadCheck();
  }, [checkId]);

  if (!check) return null;

  const fields = [
    { name: 'Payee', value: check.payee, confidence: check.payee_confidence, source: check.payee_source },
    { name: 'Amount', value: formatCurrency(check.amount || 0), confidence: check.amount_confidence, source: check.amount_source },
    { name: 'Date', value: check.check_date, confidence: check.check_date_confidence, source: check.check_date_source },
    { name: 'Check #', value: check.check_number, confidence: check.check_number_confidence, source: check.check_number_source },
  ];

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b">
        <h2 className="text-xl font-semibold">Extracted Fields</h2>
        <p className="text-sm text-gray-600 mt-1">Results from hybrid OCR + AI extraction</p>
      </div>
      <div className="p-6">
        <div className="grid gap-4">
          {fields.map((field) => (
            <div key={field.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-gray-600 mb-1">{field.name}</p>
                <p className="font-medium text-lg">{field.value}</p>
              </div>
              <div className="text-right">
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  (field.confidence || 0) >= 0.9 ? 'bg-green-100 text-green-800' :
                  (field.confidence || 0) >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {formatConfidence(field.confidence || 0)}
                </div>
                <p className="text-xs text-gray-500 mt-1 uppercase">{field.source}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}