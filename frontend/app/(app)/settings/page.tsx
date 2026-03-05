'use client'

import { useState, useEffect } from 'react'
import { Save, AlertCircle, Key, ExternalLink, CheckCircle, XCircle, Users, Settings as SettingsIcon, Plug, Upload, FileText, Loader2 } from 'lucide-react'
import QuickBooksFilters, { FilterParams } from '@/components/QuickBooksFilters'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general')
    const [qboConnected, setQboConnected] = useState(false)
    const [qbConfigured, setQbConfigured] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [geminiApiKey, setGeminiApiKey] = useState('')
    const [saving, setSaving] = useState(false)
    const [showQBCredentialsDialog, setShowQBCredentialsDialog] = useState(false)
    const [qbClientId, setQbClientId] = useState('')
    const [qbClientSecret, setQbClientSecret] = useState('')
    const [qbRedirectUri, setQbRedirectUri] = useState('')
    const [testingConnection, setTestingConnection] = useState(false)
    const [uploadingQBO, setUploadingQBO] = useState(false)
    const [qboUploadResult, setQboUploadResult] = useState<{ success: boolean; message: string } | null>(null)
    const [pullingData, setPullingData] = useState(false)
    const [pullResult, setPullResult] = useState<any>(null)
    const [loadingSettings, setLoadingSettings] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [credentialsExist, setCredentialsExist] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (mounted) {
            fetchIntegrationStatus()
        }
    }, [mounted])

    const handleQBOFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingQBO(true)
        setQboUploadResult(null)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch('/api/qbo/upload-file', { method: 'POST', body: formData })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Upload failed')
            setQboUploadResult({
                success: true,
                message: `Imported ${data.imported} cheque entries from ${data.fileName}${data.totalTransactions ? ` (${data.totalTransactions} total transactions)` : ''}`,
            })
        } catch (err: any) {
            setQboUploadResult({ success: false, message: err.message })
        } finally {
            setUploadingQBO(false)
            e.target.value = ''
        }
    }

    const fetchIntegrationStatus = async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            if (!session) {
                console.error('No session found')
                setLoadingSettings(false)
                return
            }

            const response = await fetch('/api/settings/integrations', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })
            
            if (response.ok) {
                const data = await response.json()
                setQboConnected(data.qboConnected || false)
                setQbConfigured(data.qbConfigured || false)
                setCredentialsExist(data.credentialsExist || false)
                setCompanyId(data.companyId || data.realmId || null)
                setGeminiApiKey(data.geminiApiKey ? '••••••••••••' : '')
                setQbClientId(data.qbClientId || '')
                setQbClientSecret(data.qbClientSecret || '')
                setQbRedirectUri(data.qbRedirectUri || '')
            }
        } catch (error) {
            console.error('Failed to fetch integration status:', error)
        } finally {
            setLoadingSettings(false)
        }
    }

    const handleTestConnection = async () => {
        setTestingConnection(true)
        try {
            const response = await fetch('/api/qbo/pull-checks?test=true', { method: 'POST' })
            const data = await response.json()
            if (response.ok) {
                toast.success(`Connection successful! Company: ${data.companyName || 'Unknown'}, Entries: ${data.count || 0}`, {
                    duration: 4000,
                    icon: '✅'
                })
            } else {
                toast.error(`Connection failed: ${data.error || 'Unknown error'}`, {
                    duration: 4000
                })
            }
        } catch (error: any) {
            toast.error(`Connection test failed: ${error.message}`, {
                duration: 4000
            })
        } finally {
            setTestingConnection(false)
        }
    }

    const handlePullData = async (filters: FilterParams) => {
        setPullingData(true)
        setPullResult(null)
        try {
            const response = await fetch('/api/qbo/pull-checks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...filters, store: true })
            })
            const data = await response.json()
            if (response.ok) {
                setPullResult({
                    success: true,
                    message: `Successfully fetched ${data.count} cheque entries${data.total_before_filters !== data.count ? ` (${data.total_before_filters} total, ${data.count} after filters)` : ''}`,
                    data
                })
            } else {
                setPullResult({
                    success: false,
                    message: data.error || data.message || 'Failed to pull data'
                })
            }
        } catch (error: any) {
            setPullResult({
                success: false,
                message: error.message || 'Failed to pull data from QuickBooks'
            })
        } finally {
            setPullingData(false)
        }
    }

    const handleQBOConnect = async () => {
        if (!qbConfigured) {
            toast.error('QuickBooks credentials not configured. Please save your credentials first.', {
                duration: 5000,
                icon: '⚠️'
            })
            setShowQBCredentialsDialog(true)
            return
        }
        
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            if (!session) {
                toast.error('Session expired. Please refresh the page.', {
                    duration: 5000,
                    icon: '⚠️'
                })
                return
            }

            const response = await fetch('/api/qbo/auth', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })
            if (response.ok) {
                const { authUrl } = await response.json()
                console.log('🔗 Redirecting to QuickBooks OAuth:', authUrl)
                window.location.href = authUrl
            } else {
                const error = await response.json()
                console.error('❌ QB OAuth error:', error)
                
                if (error.error === 'QuickBooks OAuth not configured' || error.error === 'QuickBooks not configured') {
                    toast.error(error.detail || 'Please configure your QuickBooks credentials first.', {
                        duration: 5000,
                        icon: '⚠️'
                    })
                    setShowQBCredentialsDialog(true)
                } else {
                    toast.error('Failed to connect: ' + (error.detail || error.message || 'Unknown error'), {
                        duration: 4000
                    })
                }
            }
        } catch (error) {
            console.error('Failed to initiate QBO connection:', error)
            toast.error('Failed to connect to QuickBooks', {
                duration: 4000
            })
        }
    }

    const handleQBODisconnect = async () => {
        try {
            const response = await fetch('/api/qbo/disconnect', { method: 'POST' })
            if (response.ok) {
                setQboConnected(false)
                toast.success('Disconnected from QuickBooks. Credentials preserved.', {
                    duration: 3000,
                    icon: '✅'
                })
                await fetchIntegrationStatus()
            }
        } catch (error) {
            console.error('Failed to disconnect QBO:', error)
            toast.error('Failed to disconnect', { duration: 4000 })
        }
    }

    const handleSaveApiKeys = async () => {
        setSaving(true)
        try {
            const response = await fetch('/api/settings/integrations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geminiApiKey }),
            })

            if (response.ok) {
                toast.success('API keys saved successfully', {
                    duration: 3000,
                    icon: '✅'
                })
            }
        } catch (error) {
            console.error('Failed to save API keys:', error)
            toast.error('Failed to save API keys', {
                duration: 4000
            })
        } finally {
            setSaving(false)
        }
    }

    const handleSaveQBCredentials = async () => {
        setSaving(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            if (!session) {
                toast.error('Session expired. Please refresh the page.', {
                    duration: 5000,
                    icon: '⚠️'
                })
                setSaving(false)
                return
            }

            const response = await fetch('/api/settings/integrations', {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ 
                    qbClientId, 
                    qbClientSecret, 
                    qbRedirectUri 
                }),
            })

            if (response.ok) {
                toast.success('QuickBooks credentials saved successfully', {
                    duration: 3000,
                    icon: '✅'
                })
                setShowQBCredentialsDialog(false)
                fetchIntegrationStatus()
            } else {
                const error = await response.json().catch(() => ({}))
                toast.error('Failed to save credentials: ' + (error.error || 'Unknown error'), {
                    duration: 5000
                })
            }
        } catch (error) {
            console.error('Failed to save QB credentials:', error)
            toast.error('Failed to save QuickBooks credentials', {
                duration: 4000
            })
        } finally {
            setSaving(false)
        }
    }

    const tabs = [
        { id: 'general', label: 'General', icon: SettingsIcon },
        { id: 'integrations', label: 'Integrations', icon: Plug },
        { id: 'team', label: 'Team', icon: Users },
    ]

    return (
        <>
            <Toaster 
                position="top-right"
                toastOptions={{
                    success: {
                        style: {
                            background: '#10b981',
                            color: '#fff',
                        },
                    },
                    error: {
                        style: {
                            background: '#ef4444',
                            color: '#fff',
                        },
                    },
                }}
            />
            <div className="p-8 max-w-6xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
                <p className="text-gray-600 mb-8">Manage your application settings and integrations</p>

            {/* Tabs Navigation */}
            <div className="border-b border-gray-200 mb-8">
                <nav className="flex gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === tab.id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* General Settings Tab */}
            {activeTab === 'general' && (
                <div className="space-y-6">
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
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
                <div className="space-y-6">
                    {/* QuickBooks Online Integration */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                                    QuickBooks Online
                                    {qboConnected && <CheckCircle className="text-green-600" size={20} />}
                                </h2>
                                <p className="text-gray-600 text-sm mt-1">
                                    Connect to QuickBooks Online for data import and export
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900">Connection Status</p>
                                    <div className="mt-2 space-y-1">
                                        {qbConfigured ? (
                                            <div className="flex items-center gap-2 text-blue-600 text-sm">
                                                <Key size={14} />
                                                <span>Credentials configured (from .env.local)</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-amber-600 text-sm">
                                                <AlertCircle size={14} />
                                                <span>Credentials not configured</span>
                                            </div>
                                        )}
                                        {qboConnected ? (
                                            <div className="flex items-center gap-2 text-green-600 text-sm">
                                                <CheckCircle size={14} />
                                                <span>Connected to QuickBooks{companyId ? ` (${companyId})` : ''}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-gray-500 text-sm">
                                                <XCircle size={14} />
                                                <span>Not connected - OAuth required</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {qbConfigured && !qboConnected && (
                                        <button
                                            onClick={handleTestConnection}
                                            disabled={testingConnection}
                                            className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {testingConnection ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                                            Test Connection
                                        </button>
                                    )}
                                    {qboConnected ? (
                                        <button
                                            onClick={handleQBODisconnect}
                                            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                                        >
                                            Disconnect
                                        </button>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowQBCredentialsDialog(true)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                                        >
                                            <Key size={16} />
                                            Configure Credentials
                                        </button>
                                        <button
                                            onClick={handleQBOConnect}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                                        >
                                            <ExternalLink size={16} />
                                            Connect to QuickBooks
                                        </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                            <div className="text-sm text-blue-900">
                                <p className="font-medium mb-1">What you can do:</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-800">
                                    <li>Import QuickBooks data for comparison</li>
                                    <li>Export checks as Expenses or Check transactions</li>
                                    <li>Automatic duplicate detection</li>
                                    <li>Map payees to QuickBooks vendors</li>
                                </ul>
                            </div>
                        </div>

                        {/* Pull Data Section with Filters */}
                        {qboConnected && (
                            <div className="mt-6 space-y-4">
                                <div className="border-t border-gray-200 pt-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Fetch QuickBooks Data</h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Pull cheque data from QuickBooks with optional filters to control what data is imported.
                                    </p>
                                    
                                    <QuickBooksFilters 
                                        onApplyFilters={handlePullData}
                                        isLoading={pullingData}
                                    />

                                    {pullResult && (
                                        <div className={`mt-4 rounded-lg p-4 flex items-start gap-3 ${
                                            pullResult.success
                                                ? 'bg-emerald-50 border border-emerald-200'
                                                : 'bg-red-50 border border-red-200'
                                        }`}>
                                            {pullResult.success
                                                ? <CheckCircle className="text-emerald-600 flex-shrink-0 mt-0.5" size={18} />
                                                : <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                                            }
                                            <div className="flex-1">
                                                <p className={`text-sm font-medium ${
                                                    pullResult.success ? 'text-emerald-800' : 'text-red-800'
                                                }`}>
                                                    {pullResult.message}
                                                </p>
                                                {pullResult.success && pullResult.data && (
                                                    <div className="mt-2 text-xs text-emerald-700">
                                                        <p className="font-medium mb-1">Breakdown:</p>
                                                        <ul className="space-y-0.5">
                                                            <li>• Cheques Written: {pullResult.data.breakdown?.cheques_written || 0}</li>
                                                            <li>• Bills Paid by Cheque: {pullResult.data.breakdown?.bills_paid_by_cheque || 0}</li>
                                                            <li>• Cheques Received: {pullResult.data.breakdown?.cheques_received || 0}</li>
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Import from File */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                                    <FileText size={20} />
                                    Import from File
                                </h2>
                                <p className="text-gray-600 text-sm mt-1">
                                    Upload a .qbo, .ofx, or .qfx file exported from your bank — no QuickBooks account needed
                                </p>
                            </div>
                        </div>

                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer relative">
                            <input
                                type="file"
                                accept=".qbo,.ofx,.qfx"
                                onChange={handleQBOFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={uploadingQBO}
                            />
                            {uploadingQBO ? (
                                <Loader2 size={32} className="mx-auto mb-3 text-blue-500 animate-spin" />
                            ) : (
                                <Upload size={32} className="mx-auto mb-3 text-gray-400" />
                            )}
                            <p className="text-sm font-medium text-gray-700">
                                {uploadingQBO ? 'Parsing file...' : 'Drop a .qbo / .ofx / .qfx file here or click to browse'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                Download these files from your bank&apos;s online banking portal
                            </p>
                        </div>

                        {qboUploadResult && (
                            <div className={`mt-4 rounded-lg p-4 flex items-start gap-3 ${
                                qboUploadResult.success
                                    ? 'bg-emerald-50 border border-emerald-200'
                                    : 'bg-red-50 border border-red-200'
                            }`}>
                                {qboUploadResult.success
                                    ? <CheckCircle className="text-emerald-600 flex-shrink-0 mt-0.5" size={18} />
                                    : <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                                }
                                <p className={`text-sm ${qboUploadResult.success ? 'text-emerald-800' : 'text-red-800'}`}>
                                    {qboUploadResult.message}
                                </p>
                            </div>
                        )}

                        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                            <div className="text-sm text-amber-900">
                                <p className="font-medium mb-1">Two ways to get cheque data:</p>
                                <ul className="list-disc list-inside space-y-1 text-amber-800 text-xs">
                                    <li><strong>Path A (this section):</strong> Upload .qbo file from your bank — free, no accounts needed</li>
                                    <li><strong>Path B (above):</strong> Connect to QuickBooks Online via API — requires QBO subscription + Intuit Developer account</li>
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
                </div>
            )}

            {/* Team Tab */}
            {activeTab === 'team' && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Management</h2>
                        <p className="text-gray-600">Team management features coming soon...</p>
                    </div>
                </div>
            )}

            {/* QuickBooks Credentials Dialog */}
            {showQBCredentialsDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowQBCredentialsDialog(false) }}>
                    <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-auto">
                        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-bold">QuickBooks Credentials</h3>
                                <p className="text-sm text-blue-100">Configure your QuickBooks OAuth credentials</p>
                            </div>
                            <button onClick={() => setShowQBCredentialsDialog(false)} className="p-2 hover:bg-white/20 rounded-lg transition">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {credentialsExist && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                                    <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
                                    <div className="text-sm text-green-900">
                                        <p className="font-medium">Credentials exist</p>
                                        <p className="text-green-700 mt-1">QuickBooks credentials are already saved. You can update them below if needed.</p>
                                    </div>
                                </div>
                            )}
                            
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                                <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                                <div className="text-sm text-blue-900">
                                    <p className="font-medium mb-1">Get your credentials from:</p>
                                    <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                                        https://developer.intuit.com
                                    </a>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Client ID</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={qbClientId}
                                        onChange={(e) => setQbClientId(e.target.value)}
                                        placeholder="Enter your QuickBooks Client ID"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Client Secret</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="password"
                                        value={qbClientSecret}
                                        onChange={(e) => setQbClientSecret(e.target.value)}
                                        placeholder="Enter your QuickBooks Client Secret"
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Redirect URI</label>
                                <input
                                    type="text"
                                    value={qbRedirectUri}
                                    onChange={(e) => setQbRedirectUri(e.target.value)}
                                    placeholder="http://localhost:3000/api/qbo/callback"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">This must match the redirect URI in your QuickBooks app settings</p>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-200 rounded-b-xl">
                            <button
                                onClick={() => setShowQBCredentialsDialog(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveQBCredentials}
                                disabled={saving || !qbClientId || !qbClientSecret}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Credentials'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    )
}
