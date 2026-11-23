import { useMemo } from 'react';
import { CheckExtraction, QuickBooksEntry } from '../utils/comparisonUtils';
import { useJobsFull, useQuickbooksEntries } from '@/lib/queries';
import { useOptionalQBConnections } from '@/hooks/useQBConnections';

/**
 * Jobs (with their cheques — this page genuinely compares them) and the stored
 * QB entries load in PARALLEL as two cached queries. They used to run one after
 * the other, so the entries request only started once /api/jobs finished.
 */
export function useComparisonData() {
  const realmId = useOptionalQBConnections()?.active?.realmId ?? null;
  const jobsQ = useJobsFull();
  const entriesQ = useQuickbooksEntries(realmId);

  const qbEntries: QuickBooksEntry[] = useMemo(
    () =>
      (entriesQ.data || []).map((entry: any, idx: number) => ({
        id: entry.id || `qb-${idx}`,
        checkNumber: entry.check_number || '',
        date: entry.date || '',
        amount: entry.amount || '',
        payee: entry.payee || '',
        account: entry.account || 'Checking',
        memo: entry.memo || '',
        source: 'quickbooks' as const,
        qbSource: entry.qb_source || 'default',
        intuit_id: entry.intuit_id || '',
        qb_type: entry.qb_type || '',
      })),
    [entriesQ.data]
  );

  const qbSources = useMemo(
    () => Array.from(new Set(qbEntries.map((e) => e.qbSource || 'default'))),
    [qbEntries]
  );

  // Only the active company's uploads: comparing every company's cheques
  // against one company's QB rows produced cross-company matches. Uploads
  // with no company are held back until assigned (see untaggedJobs).
  const extractions: CheckExtraction[] = useMemo(
    () =>
      (jobsQ.data || [])
        .filter((job: any) => realmId && job.realm_id === realmId)
        .flatMap((job: any) =>
          job.checks?.length > 0
            ? job.checks.map((check: any) => ({ ...check, job_id: job.job_id, pdf_name: job.pdf_name }))
            : []
        ),
    [jobsQ.data, realmId]
  );

  const err = jobsQ.error || entriesQ.error;

  return {
    // Only the first load counts as loading; background refetches keep the grid.
    loading: jobsQ.isPending || entriesQ.isPending,
    refreshing: jobsQ.isFetching || entriesQ.isFetching,
    extractions,
    qbEntries,
    qbSources,
    error: err ? (err instanceof Error ? err.message : 'Failed to fetch data') : null,
    refreshData: () => Promise.all([jobsQ.refetch(), entriesQ.refetch()]),
  };
}
