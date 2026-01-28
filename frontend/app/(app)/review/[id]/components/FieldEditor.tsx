'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@/types/check';
import ConfidenceBadge from './ConfidenceBadge';
import { createClient } from '@/lib/supabase/client';

interface Props {
  check: Check;
}

export default function FieldEditor({ check }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState({
    payee: check.payee || '',
    amount: check.amount?.toString() || '',
    check_date: check.check_date || '',
    check_number: check.check_number || '',
    bank_name: check.bank_name || '',
  });
  const [saving, setSaving] = useState(false);

  const handleFieldChange = (field: string, value: string) => {
    setFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from('checks')
        .update({
          payee: fields.payee,
          amount: parseFloat(fields.amount),
          check_date: fields.check_date,
          check_number: fields.check_number,
          bank_name: fields.bank_name,
          // Mark as manual edits
          payee_source: 'manual',
          amount_source: 'manual',
          check_date_source: 'manual',
          check_number_source: 'manual',
        })
        .eq('id', check.id);

      if (error) throw error;

      // Create audit log
      await fetch(`/api/checks/${check.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      router.refresh();
      alert('Changes saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b">
        <h3 className="font-semibold">Extracted Fields</h3>
        <p className="text-sm text-gray-600 mt-1">Review and edit as needed</p>
      </div>

      <div className="p-6 space-y-4">
        {/* Payee */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Payee
            </label>
            <ConfidenceBadge 
              confidence={check.payee_confidence || 0}
              source={check.payee_source || 'ocr'}
            />
          </div>
          <input
            type="text"
            value={fields.payee}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('payee', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Amount
            </label>
            <ConfidenceBadge 
              confidence={check.amount_confidence || 0}
              source={check.amount_source || 'ocr'}
            />
          </div>
          <div className="relative">
            <span className="absolute left-4 top-2 text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              value={fields.amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('amount', e.target.value)}
              className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <ConfidenceBadge 
              confidence={check.check_date_confidence || 0}
              source={check.check_date_source || 'ocr'}
            />
          </div>
          <input
            type="date"
            value={fields.check_date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('check_date', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Check Number */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Check Number
            </label>
            <ConfidenceBadge 
              confidence={check.check_number_confidence || 0}
              source={check.check_number_source || 'ocr'}
            />
          </div>
          <input
            type="text"
            value={fields.check_number}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('check_number', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Bank Name */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Bank Name
            </label>
            <ConfidenceBadge 
              confidence={check.bank_name_confidence || 0}
              source={check.bank_name_source || 'ocr'}
            />
          </div>
          <input
            type="text"
            value={fields.bank_name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange('bank_name', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}