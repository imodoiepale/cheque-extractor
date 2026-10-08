'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';

interface Props {
  checkId: string;
  currentStatus: string;
}

export default function ApprovalActions({ checkId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'approve' | 'reject') => {
    if (!confirm(action === 'approve' ? 'Approve this check?' : 'Reject this check?')) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/checks/${checkId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) throw new Error(`${action === 'approve' ? 'Approval' : 'Rejection'} failed`);

      router.push(action === 'approve' ? '/export' : '/dashboard');
    } catch (e: any) {
      setError(e?.message || `Failed to ${action} check`);
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus === 'approved' || currentStatus === 'exported') {
    return <StatusPill status="approved" size="lg" icon={<Check size={14} />} label="Approved" />;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-3">
        <Button
          variant="destructive"
          size="sm"
          icon={<X size={18} />}
          disabled={loading}
          onClick={() => act('reject')}
        >
          Reject
        </Button>
        <Button
          size="sm"
          icon={<Check size={18} />}
          loading={loading}
          onClick={() => act('approve')}
        >
          Approve
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-error-text">{error}</p>
      )}
    </div>
  );
}
