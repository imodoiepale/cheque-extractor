'use client';

import { AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Props {
  show: boolean;
  onDismiss?: () => void;
}

export default function QuickBooksSetupAlert({ show, onDismiss }: Props) {
  if (!show) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 mb-1">
            QuickBooks Online Not Connected
          </h3>
          <p className="text-sm text-blue-800 mb-3">
            Connect your QuickBooks Online account to enable automatic check exports and syncing.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ExternalLink size={16} />
              Connect QuickBooks
            </Link>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-sm text-blue-700 hover:text-blue-900"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
