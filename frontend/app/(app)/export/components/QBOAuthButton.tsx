'use client';

import { useState } from 'react';
import { Link as LinkIcon, Unlink } from 'lucide-react';

interface Props {
  isConnected: boolean;
}

export default function QBOAuthButton({ isConnected }: Props) {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    window.location.href = '/api/qbo/auth';
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect from QuickBooks Online?')) return;

    setLoading(true);
    try {
      const response = await fetch('/api/qbo/disconnect', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Disconnect failed');

      window.location.reload();
    } catch (error) {
      alert('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  if (isConnected) {
    return (
      <button
        onClick={handleDisconnect}
        disabled={loading}
        className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
      >
        <Unlink size={18} />
        Disconnect QuickBooks
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
    >
      <LinkIcon size={18} />
      Connect QuickBooks Online
    </button>
  );
}