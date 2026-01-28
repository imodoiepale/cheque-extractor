'use client'

import { useState } from 'react'
import { Save, AlertCircle } from 'lucide-react'

export default function SettingsPage() {
    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

            <div className="space-y-6">
                {/* QuickBooks Integration */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">QuickBooks Integration</h2>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <div>
                            <p className="font-medium text-gray-900">Connection Status</p>
                            <p className="text-sm text-gray-500">Not connected</p>
                        </div>
                        <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors">
                            Connect to QuickBooks
                        </button>
                    </div>

                    <div className="mt-4 text-sm text-gray-500 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p>
                            Connecting will allow you to export approved checks directly as Expenses or Checks in QuickBooks Online.
                        </p>
                    </div>
                </div>

                {/* Export Preferences */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Export Preferences</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Default Export Status
                            </label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm">
                                <option>Draft</option>
                                <option>Ready to Post</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="auto-export" className="rounded text-blue-600" />
                            <label htmlFor="auto-export" className="text-sm text-gray-700">Auto-export approved checks (when confidence &gt; 95%)</label>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                            <Save className="w-4 h-4" />
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
