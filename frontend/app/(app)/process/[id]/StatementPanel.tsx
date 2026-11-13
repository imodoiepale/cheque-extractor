'use client';

import { useEffect, useState } from 'react';
import { Badge, GlassCard, GlassCardTitle, Table, TableScroll, TableShell, Tbody, Td, Th, Thead, Tr } from '@/components/ui';
import { useSpelling } from '@/hooks/useSpelling';

interface StatementRow {
  page: number;
  row_index: number;
  check_number: string | null;
  date: string | null;
  amount: number;
}

interface UnmatchedImage {
  check_id: string;
  number: string | null;
  amount: number | null;
}

interface Reconciliation {
  rows: StatementRow[];
  unmatched_rows: StatementRow[];
  unmatched_images: UnmatchedImage[];
  summary: { rows: number; images: number; matched: number; rows_without_image: number; images_without_row: number };
}

const money = (n: number | null) =>
  n == null ? '-' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Longest unmatched list shown inline; the counts above are always exact. */
const SHOW = 50;

/**
 * What the bank statement says went out, set against the cheque images we hold.
 * Renders nothing unless the statement lists cheques: a plain sheet of cheque
 * images has no statement to reconcile.
 */
export default function StatementPanel({ jobId, imageCount, readCount = 0 }: { jobId: string; imageCount: number; readCount?: number }) {
  const t = useSpelling();
  const [data, setData] = useState<Reconciliation | null>(null);
  const [failed, setFailed] = useState(false);

  // Refetch as extraction reads each cheque, not only when the image count
  // changes: the count stays the same while numbers and amounts are filled in,
  // so the panel kept its first, empty pairing (Michael, 12 Nov: "No number").
  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${jobId}/statement-rows`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Reconciliation) => { if (live) { setData(d); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [jobId, imageCount, readCount]);

  if (failed || !data || data.summary.rows === 0) return null;

  const s = data.summary;
  const clean = s.rows_without_image === 0 && s.images_without_row === 0;

  return (
    <GlassCard padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GlassCardTitle>Statement reconciliation</GlassCardTitle>
        <Badge tone={clean ? 'success' : 'warning'} size="sm">
          {clean ? t('Every listed cheque has an image') : 'Needs a look'}
        </Badge>
      </div>

      <p className="nums text-sm text-ink-body">
        {s.rows} listed on the statement · {s.matched} matched to an image ·{' '}
        <span className={s.rows_without_image ? 'font-semibold text-ink-strong' : undefined}>
          {s.rows_without_image} without an image
        </span>{' '}
        ·{' '}
        <span className={s.images_without_row ? 'font-semibold text-ink-strong' : undefined}>
          {s.images_without_row} images not on the statement
        </span>
      </p>

      {data.unmatched_rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-strong">{t('The statement lists a cheque we have no image for')}</p>
          <TableShell>
            <TableScroll className="max-h-72">
              <Table>
                <Thead>
                  <tr>
                    <Th numeric>{t('Check #')}</Th>
                    <Th>Date</Th>
                    <Th numeric>Amount</Th>
                    <Th numeric>Page</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {data.unmatched_rows.slice(0, SHOW).map((r) => (
                    <Tr key={`${r.page}-${r.row_index}`}>
                      <Td numeric>{r.check_number ?? '-'}</Td>
                      <Td>{r.date ?? '-'}</Td>
                      <Td numeric>{money(r.amount)}</Td>
                      <Td numeric muted>{r.page}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableScroll>
          </TableShell>
          {data.unmatched_rows.length > SHOW && (
            <p className="text-xs text-ink-faint">Showing the first {SHOW} of {data.unmatched_rows.length}.</p>
          )}
        </div>
      )}

      {data.unmatched_images.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink-strong">We hold an image the statement does not list</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.unmatched_images.slice(0, SHOW).map((im) => (
              <li key={im.check_id} className="space-y-1">
                <div className="h-20 overflow-hidden rounded-md bg-surface-sunken">
                  <img
                    src={`/api/check-image/${jobId}/${im.check_id}?w=240`}
                    alt={`${t('Cheque')} ${im.number ?? im.check_id}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </div>
                <p className="nums text-xs text-ink-body">
                  {im.number ? `#${im.number}` : 'No number'} · {money(im.amount)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
