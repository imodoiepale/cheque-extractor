import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * Update Check Extraction Data
 * Allows manual correction of extracted check fields
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { checkNumber, date, amount, payee, bankAccount, memo } = req.body;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Check ID is required' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Build update object with only provided fields
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (checkNumber !== undefined) {
      updates.check_number = checkNumber;
      updates.check_number_source = 'manual';
    }
    if (date !== undefined) {
      updates.check_date = date;
      updates.check_date_source = 'manual';
    }
    if (amount !== undefined) {
      updates.amount = parseFloat(amount);
      updates.amount_source = 'manual';
    }
    if (payee !== undefined) {
      updates.payee = payee;
      updates.payee_source = 'manual';
    }
    if (bankAccount !== undefined) {
      updates.bank_name = bankAccount;
      updates.bank_name_source = 'manual';
    }
    if (memo !== undefined) {
      updates.memo = memo;
    }

    // Update the check record
    const { data, error } = await supabase
      .from('checks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update check:', error);
      return res.status(500).json({ error: 'Failed to update check', details: error.message });
    }

    // Log the manual edit in audit trail
    try {
      const auditLogs = [];
      
      if (checkNumber !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'check_number',
          new_value: checkNumber,
          user_id: null, // TODO: Add user authentication
        });
      }
      if (date !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'check_date',
          new_value: date,
          user_id: null,
        });
      }
      if (amount !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'amount',
          new_value: amount.toString(),
          user_id: null,
        });
      }
      if (payee !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'payee',
          new_value: payee,
          user_id: null,
        });
      }
      if (bankAccount !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'bank_name',
          new_value: bankAccount,
          user_id: null,
        });
      }
      if (memo !== undefined) {
        auditLogs.push({
          check_id: id,
          action: 'updated',
          field: 'memo',
          new_value: memo,
          user_id: null,
        });
      }

      if (auditLogs.length > 0) {
        await supabase.from('audit_logs').insert(auditLogs);
      }
    } catch (auditError) {
      console.error('Failed to create audit logs:', auditError);
      // Don't fail the request if audit logging fails
    }

    return res.status(200).json({
      success: true,
      check: data,
      message: 'Check updated successfully',
    });
  } catch (error: any) {
    console.error('Update check error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update check' });
  }
}
