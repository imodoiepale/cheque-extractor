'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from '@/types/check';
import ConfidenceBadge from './ConfidenceBadge';
import { createClient } from '@/lib/supabase/client';
import { Button, GlassCard, GlassCardTitle, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Props {
  check: Check;
}

/** The five editable fields, declared once instead of five copied blocks. */
type FieldKey = 'payee' | 'amount' | 'check_date' | 'check_number' | 'bank_name';

const FIELDS: ReadonlyArray<{
  key: FieldKey;
  label: string;
  type: 'text' | 'number' | 'date';
  prefix?: string;
}> = [
  { key: 'payee', label: 'Payee', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'number', prefix: '$' },
  { key: 'check_date', label: 'Date', type: 'date' },
  { key: 'check_number', label: 'Check Number', type: 'text' },
  { key: 'bank_name', label: 'Bank Name', type: 'text' },
];

const STATUS_TONE = {
  success: 'border-success-border bg-success-bg text-success-text',
  warning: 'border-warning-border bg-warning-bg text-warning-text',
  error: 'border-error-border bg-error-bg text-error-text',
} as const;

export default function FieldEditor({ check }: Props) {
  const router = useRouter();

  const snapshot = (): Record<FieldKey, string> => ({
    payee: check.payee || '',
    amount: check.amount?.toString() || '',
    check_date: check.check_date || '',
    check_number: check.check_number || '',
    bank_name: check.bank_name || '',
  });

  const [fields, setFields] = useState(snapshot);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: keyof typeof STATUS_TONE; text: string } | null>(null);

  // Track originals so we can compute the diff to push to QB.
  const original = snapshot();

  const handleFieldChange = (field: FieldKey, value: string) => {
    setFields(prev => ({ ...prev, [field]: value }));
  };

  /**
   * After saving locally, look up the linked QB transaction (matches.qb_txn_id)
   * and push only the fields that actually changed to QuickBooks.
   * Returns a human-readable status string for the inline banner.
   */
  const pushChangesToQB = async (changed: Record<string, any>): Promise<{ ok: boolean; message: string }> => {
    try {
      const supabase = createClient();
      const { data: match } = await supabase
        .from('matches')
        .select('qb_txn_id')
        .eq('check_id', check.id)
        .maybeSingle();
      if (!match?.qb_txn_id) {
        return { ok: false, message: 'No linked QuickBooks transaction — saved locally only.' };
      }

      // Map check fields to update-transaction.ts payload
      const apiFields: Record<string, any> = {};
      if (changed.amount != null)        apiFields.amount    = changed.amount;
      if (changed.check_date)            apiFields.txnDate   = changed.check_date;
      if (changed.check_number != null)  apiFields.docNumber = String(changed.check_number);
      if (Object.keys(apiFields).length === 0) {
        return { ok: true, message: 'No QB-relevant fields changed.' };
      }

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/qbo/update-transaction', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ qbTxnId: match.qb_txn_id, fields: apiFields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: data?.error || `QB sync failed (${res.status})` };
      }
      return { ok: true, message: `QuickBooks updated: ${Object.keys(apiFields).join(', ')}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'QB sync failed (network error)' };
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const supabase = createClient();

      // Compute changed fields vs originals
      const parsedAmount = parseFloat(fields.amount);
      const changed: Record<string, any> = {};
      if (fields.payee !== original.payee)               changed.payee = fields.payee;
      if (fields.amount !== original.amount && !isNaN(parsedAmount)) changed.amount = parsedAmount;
      if (fields.check_date !== original.check_date)     changed.check_date = fields.check_date;
      if (fields.check_number !== original.check_number) changed.check_number = fields.check_number;
      if (fields.bank_name !== original.bank_name)       changed.bank_name = fields.bank_name;

      const { error } = await supabase
        .from('checks')
        .update({
          payee: fields.payee,
          amount: isNaN(parsedAmount) ? null : parsedAmount,
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

      // Push the diff to QuickBooks (non-blocking — we still show local save success on QB failure)
      if (Object.keys(changed).length > 0) {
        const qb = await pushChangesToQB(changed);
        if (qb.ok) {
          setStatusMessage({ type: 'success', text: `Saved — ${qb.message}` });
        } else {
          setStatusMessage({ type: 'warning', text: `Saved locally — ${qb.message}` });
        }
      } else {
        setStatusMessage({ type: 'success', text: 'Saved — no changes detected.' });
      }
      router.refresh();
    } catch (error: any) {
      console.error('Save error:', error);
      setStatusMessage({ type: 'error', text: error?.message || 'Failed to save changes.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard padding="none" className="overflow-hidden">
      <div className="border-b border-glass-hairline px-6 py-4">
        <GlassCardTitle className="text-base">Extracted Fields</GlassCardTitle>
        <p className="mt-1 text-sm text-ink-body">Review and edit as needed</p>
      </div>

      <div className="space-y-4 p-6">
        {FIELDS.map(({ key, label, type, prefix }) => {
          const id = `field-${key}`;
          return (
            <div key={key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor={id} className="block text-sm font-medium text-ink-body">
                  {label}
                </label>
                <ConfidenceBadge
                  confidence={(check as any)[`${key}_confidence`] || 0}
                  source={(check as any)[`${key}_source`] || 'ocr'}
                />
              </div>
              <div className="relative">
                {prefix && (
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
                    {prefix}
                  </span>
                )}
                <Input
                  id={id}
                  type={type}
                  step={type === 'number' ? '0.01' : undefined}
                  value={fields[key]}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  className={cn(prefix && 'pl-7', type === 'number' && 'nums')}
                />
              </div>
            </div>
          );
        })}

        {/* Inline status banner */}
        {statusMessage && (
          <p role="status" className={cn('rounded-input border px-3 py-2 text-sm', STATUS_TONE[statusMessage.type])}>
            {statusMessage.text}
          </p>
        )}

        {/* Save Button */}
        <Button block loading={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save Changes (& push to QB if linked)'}
        </Button>
      </div>
    </GlassCard>
  );
}
