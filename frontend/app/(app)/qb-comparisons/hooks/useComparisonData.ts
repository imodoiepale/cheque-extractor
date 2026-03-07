import { useState, useEffect, useCallback } from 'react';
import { CheckExtraction, QuickBooksEntry } from '../utils/comparisonUtils';
import { createClient } from '@/lib/supabase/client';

export function useComparisonData() {
  const [loading, setLoading] = useState(true);
  const [extractions, setExtractions] = useState<CheckExtraction[]>([]);
  const [qbEntries, setQbEntries] = useState<QuickBooksEntry[]>([]);
  const [qbSources, setQbSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get auth token for RLS enforcement
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
      };
      
      // Fetch jobs from Supabase (source=auto fetches from DB + memory)
      const jobsRes = await fetch('/api/jobs?source=auto', { headers });
      if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
      const jobsData = await jobsRes.json();
      
      const allExtractions: CheckExtraction[] = [];
      (jobsData.jobs || []).forEach((job: any) => {
        if (job.status === 'complete' && job.checks?.length > 0) {
          job.checks.forEach((check: any) => {
            // Include all checks, even without extraction (for missing data detection)
            allExtractions.push({
              ...check,
              job_id: job.job_id,
              pdf_name: job.pdf_name,
            });
          });
        }
      });
      
      setExtractions(allExtractions);
      
      try {
        console.log('🔍 Fetching QuickBooks entries from qb_entries table...');
        const qbRes = await fetch('/api/quickbooks/entries?t=' + Date.now(), { headers });
        console.log('📡 QB API Response status:', qbRes.status);
        
        if (qbRes.ok) {
          const qbData = await qbRes.json();
          console.log('📊 QB Data received:', qbData);
          console.log('📋 QB Entries count:', qbData.entries?.length || 0);
          
          const entries: QuickBooksEntry[] = (qbData.entries || []).map((entry: any, idx: number) => ({
            id: entry.id || `qb-${idx}`,
            checkNumber: entry.check_number || '',
            date: entry.date || '',
            amount: entry.amount || '',
            payee: entry.payee || '',
            account: entry.account || 'Checking',
            memo: entry.memo || '',
            source: 'quickbooks' as const,
            qbSource: entry.qb_source || 'default',
          }));
          
          console.log('✅ Processed QB entries:', entries.length);
          if (entries.length > 0) {
            console.log('📝 Sample entry:', entries[0]);
          }
          
          setQbEntries(entries);
          
          const sources = Array.from(new Set(entries.map(e => e.qbSource || 'default')));
          setQbSources(sources);
        } else {
          console.warn('⚠️ QB API returned non-OK status:', qbRes.status);
        }
      } catch (qbError) {
        console.error('❌ Error fetching QuickBooks data:', qbError);
        setQbEntries([]);
        setQbSources([]);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    loading,
    extractions,
    qbEntries,
    qbSources,
    error,
    refreshData: fetchData,
  };
}
