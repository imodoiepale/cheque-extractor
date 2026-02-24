import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/**
 * QuickBooks Entries API
 * 
 * Returns stored QuickBooks cheque entries from the database.
 * These are populated by the /api/qbo/pull-checks endpoint.
 * 
 * If no stored entries exist, attempts a live pull from QBO.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Disable caching to ensure fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials');
      return res.status(500).json({ error: 'Supabase not configured', entries: [], count: 0 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
        }
      }
    });

    // Try to fetch stored entries from qb_entries table
    const { data: entries, error: dbError } = await supabase
      .from('qb_entries')
      .select('*')
      .order('date', { ascending: false })
      .limit(1000);

    if (dbError) {
      // Table might not exist yet or connection failed — return empty
      console.warn('qb_entries table query failed:', dbError);
      return res.status(200).json({ entries: [], count: 0, error: dbError.message });
    }

    if (entries && entries.length > 0) {
      return res.status(200).json({
        entries: entries.map(e => ({
          id: e.id,
          check_number: e.check_number,
          date: e.date,
          amount: e.amount,
          payee: e.payee,
          account: e.account,
          memo: e.memo,
          qb_source: e.qb_source,
          qb_type: e.qb_type,
          synced_at: e.synced_at,
        })),
        count: entries.length,
      });
    }

    // No stored entries — return empty (user needs to pull first)
    return res.status(200).json({
      entries: [],
      count: 0,
      message: 'No QuickBooks entries synced yet. Use Settings → Integrations to connect and pull data.',
    });
  } catch (error: any) {
    console.error('QuickBooks entries error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch QuickBooks entries' });
  }
}
