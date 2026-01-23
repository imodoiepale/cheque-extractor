'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';

interface Props {
  checkId: string;
  currentStatus: string;
}

export default function ApprovalActions({ checkId, currentStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!confirm('Approve this check?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/checks/${checkId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      if (!response.ok) throw new Error('Approval failed');

      router.push('/export');
    } catch (error) {
      alert('Failed to approve check');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Reject this check?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/checks/${checkId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });

      if (!response.ok) throw new Error('Rejection failed');

      router.push('/dashboard');
    } catch (error) {
      alert('Failed to reject check');
    } finally {
      setLoading(false);
    }
  };

  if (currentStatus === 'approved' || currentStatus === 'exported') {
    return (
      <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-medium">
        ✓ Approved
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={handleReject}
        disabled={loading}
        className="px-6 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
      >
        <X size={18} />
        Reject
      </button>
      <button
        onClick={handleApprove}
        disabled={loading}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
      >
        <Check size={18} />
        Approve
      </button>
    </div>
  );
}