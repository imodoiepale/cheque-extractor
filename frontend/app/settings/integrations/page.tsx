'use client';

import { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, ExternalLink, Key, AlertCircle } from 'lucide-react';

export default function IntegrationsPage() {
  const [qboConnected, setQboConnected] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchIntegrationStatus();
  }, []);

  const fetchIntegrationStatus = async () => {
    try {
      const response = await fetch('/api/settings/integrations');
      if (response.ok) {
        const data = await response.json();
        setQboConnected(data.qboConnected || false);
        setGeminiApiKey(data.geminiApiKey ? '••••••••••••' : '');
      }
    } catch (error) {
      console.error('Failed to fetch integration status:', error);
    }
  };

  const handleQBOConnect = async () => {
    try {
      const response = await fetch('/api/qbo/auth');
      if (response.ok) {
        const { authUrl } = await response.json();
        window.location.href = authUrl;
      }
    } catch (error) {
      console.error('Failed to initiate QBO connection:', error);
    }
  };

  const handleQBODisconnect = async () => {
    try {
      const response = await fetch('/api/qbo/disconnect', { method: 'POST' });
      if (response.ok) {
        setQboConnected(false);
      }
    } catch (error) {
      console.error('Failed to disconnect QBO:', error);
    }
  };

  const handleSaveApiKeys = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey }),
      });

      if (response.ok) {
        alert('API keys saved successfully');
      }
    } catch (error) {
      console.error('Failed to save API keys:', error);
      alert('Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-600 mt-1">Manage third-party integrations and API keys</p>
      </div>

      {/* QuickBooks Online Integration */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              QuickBooks Online
              {qboConnected && <CheckCircle className="text-green-600" size={20} />}
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              Export approved checks directly to QuickBooks Online
            </p>
          </div>
          <img
            src="/images/qbo-logo.png"
            alt="QuickBooks"
            className="h-12 w-12 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Connection Status</p>
              <p className="text-sm text-gray-600 mt-1">
                {qboConnected ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle size={16} />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-gray-500">
                    <XCircle size={16} />
                    Not connected
                  </span>
                )}
              </p>
            </div>
            {qboConnected ? (
              <button
                onClick={handleQBODisconnect}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleQBOConnect}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <ExternalLink size={16} />
                Connect to QuickBooks
              </button>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">What you can do:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800">
              <li>Export checks as Expenses or Check transactions</li>
              <li>Automatic duplicate detection</li>
              <li>Sync status tracking</li>
              <li>Map payees to QuickBooks vendors</li>
            </ul>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">API Keys</h2>

        <div className="space-y-6">
          {/* Google Gemini API */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Gemini API Key
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Used for AI-powered check field extraction. Get your key from{' '}
              <a
                href="https://makersuite.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Tesseract OCR (Local) */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Tesseract OCR</p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle size={16} />
                    Installed locally
                  </span>
                </p>
              </div>
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                No API key required
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleSaveApiKeys}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save API Keys'}
          </button>
        </div>
      </div>

      {/* Webhook Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Webhooks</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Processing Complete Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://your-domain.com/webhook/processing-complete"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              Receive notifications when check processing is complete
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Complete Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://your-domain.com/webhook/export-complete"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              Receive notifications when checks are exported to QuickBooks
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Save size={18} />
            Save Webhooks
          </button>
        </div>
      </div>
    </div>
  );
}
