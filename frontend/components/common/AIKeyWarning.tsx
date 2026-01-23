'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Settings } from 'lucide-react';
import Link from 'next/link';

export default function AIKeyWarning() {
  const [hasAIKey, setHasAIKey] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAIKeyStatus();
  }, []);

  const checkAIKeyStatus = async () => {
    try {
      const response = await fetch('/api/settings/integrations');
      if (response.ok) {
        const data = await response.json();
        setHasAIKey(!!data.geminiApiKey);
      }
    } catch (error) {
      console.error('Failed to check AI key status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || hasAIKey || isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-2xl w-full mx-4">
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-800 mb-1">
              AI Key Not Connected
            </h3>
            <p className="text-sm text-yellow-700 mb-3">
              Google Gemini API key is not configured. Check processing will use OCR only, which may result in lower accuracy.
            </p>
            <Link
              href="/settings/integrations"
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition"
            >
              <Settings size={16} />
              Configure AI Key
            </Link>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="text-yellow-600 hover:text-yellow-800 transition"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
