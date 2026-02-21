import { useState, useEffect, useCallback } from 'react';
import { CheckExtraction, QuickBooksEntry } from '../utils/comparisonUtils';

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
      
      const jobsRes = await fetch('/api/jobs');
      if (!jobsRes.ok) throw new Error('Failed to fetch jobs');
      const jobsData = await jobsRes.json();
      
      const allExtractions: CheckExtraction[] = [];
      (jobsData.jobs || []).forEach((job: any) => {
        if (job.status === 'complete' && job.checks?.length > 0) {
          job.checks.forEach((check: any) => {
            if (check.extraction) {
              allExtractions.push({
                ...check,
                job_id: job.job_id,
                pdf_name: job.pdf_name,
              });
            }
          });
        }
      });
      
      setExtractions(allExtractions);
      
      try {
        const qbRes = await fetch('/api/quickbooks/entries');
        if (qbRes.ok) {
          const qbData = await qbRes.json();
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
          setQbEntries(entries);
          
          const sources = Array.from(new Set(entries.map(e => e.qbSource || 'default')));
          setQbSources(sources);
        }
      } catch (qbError) {
        console.error('Error fetching QuickBooks data:', qbError);
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
