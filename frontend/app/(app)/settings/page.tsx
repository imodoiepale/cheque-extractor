'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Save, AlertCircle, Key, ExternalLink, CheckCircle, XCircle, Users, Settings as SettingsIcon, Plug, Upload, FileText, Loader2 } from 'lucide-react'
import QuickBooksFilters, { FilterParams } from '@/components/QuickBooksFilters'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

function SettingsPageContent() {
    const [activeTab, setActiveTab] = useState('general')
    const [qboConnected, setQboConnected] = useState(false)
    const [qbConfigured, setQbConfigured] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [companyName, setCompanyName] = useState<string | null>(null)
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
    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnosisResult, setDiagnosisResult] = useState<any>(null)
    const [loadingSettings, setLoadingSettings] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [credentialsExist, setCredentialsExist] = useState(false)

    const searchParams = useSearchParams()
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
    }, [])

    // Parse URL params for OAuth callback results (fire only once)
    const handledOAuthRef = useRef(false)
    useEffect(() => {
        if (!mounted || !searchParams || handledOAuthRef.current) return
        
        const error = searchParams.get('error')
        const success = searchParams.get('success')
        const detail = searchParams.get('detail')
        const tab = searchParams.get('tab')
        
        if (tab === 'integrations') {
            setActiveTab('integrations')
        }
        
        if (error) {
            handledOAuthRef.current = true
            const errorMessages: Record<string, string> = {
                token_exchange_failed: `QuickBooks rejected the connection. ${detail ? `Detail: ${decodeURIComponent(detail)}` : 'Check that your Redirect URI matches exactly what\'s in your QuickBooks app settings.'}`,
                not_configured: 'QuickBooks credentials not found. Please configure your Client ID and Secret first.',
                missing_params: 'QuickBooks callback was missing required parameters. Please try connecting again.',
                invalid_state: 'Security check failed (state mismatch). Please try connecting again.',
                unauthorized: `Not authenticated. ${detail === 'no_session_cookie' ? 'Your session cookie was not found. Try logging in again before connecting QB.' : 'Please log in and try again.'}`,
                callback_failed: 'QuickBooks connection failed unexpectedly. Check the server logs for details.',
                storage_failed: 'Connected to QuickBooks but failed to save tokens. Please try again.',
                tenant_creation_failed: 'Failed to create your account tenant. Please contact support.',
                no_tenant: 'No tenant found for your account. Please contact support.',
            }
            
            const message = errorMessages[error] || `QuickBooks error: ${error}${detail ? ` - ${decodeURIComponent(detail)}` : ''}`
            toast.dismiss()
            toast.error(message, { duration: 8000, icon: '\u274c' })
            
            // Clean URL params
            router.replace('/settings?tab=integrations', { scroll: false })
        }
        
        if (success === 'quickbooks_connected') {
            handledOAuthRef.current = true
            toast.dismiss()
            toast.success('Successfully connected to QuickBooks!', { duration: 5000, icon: '\u2705' })
            router.replace('/settings?tab=integrations', { scroll: false })
            fetchIntegrationStatus()
        }
    }, [mounted, searchParams])

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
                setCompanyName(data.companyName || null)
                setQbClientId(data.qbClientId || '')
                setQbClientSecret(data.qbClientSecret || '')
                setQbRedirectUri(data.qbRedirectUri || '')
                
                // Fetch QB company info if connected but no company name stored
                if (data.qboConnected && !data.companyName) {
                    fetchQBCompanyInfo()
                }
            }
        } catch (error) {
            console.error('Failed to fetch integration status:', error)
        } finally {
            setLoadingSettings(false)
        }
    }

    const fetchQBCompanyInfo = async () => {
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            if (!session) return

            const response = await fetch('/api/qbo/company-info', {
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            })
            
            if (response.ok) {
                const data = await response.json()
                setCompanyName(data.companyName || null)
                console.log('✅ QB Company Info:', data.companyName)
            } else {
                console.warn('⚠️ Could not fetch QB company info')
            }
        } catch (error) {
            console.error('Failed to fetch QB company info:', error)
        }
    }

    const handleTestConnection = async () => {
        setTestingConnection(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Session expired. Please refresh the page.')
                setTestingConnection(false)
                return
            }
            const response = await fetch('/api/qbo/pull-checks?test=true', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })
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
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Session expired. Please refresh the page.')
                setPullingData(false)
                return
            }
            const response = await fetch('/api/qbo/pull-checks', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ ...filters, store: true })
            })
            const data = await response.json()
            if (response.ok) {
                const filterInfo = data.filters_applied || {};
                const filterSummary = [];
                if (filterInfo.date_range) {
                    filterSummary.push(`Date: ${filterInfo.date_range.startDate || 'any'} to ${filterInfo.date_range.endDate || 'any'}`);
                }
                if (filterInfo.account) {
                    filterSummary.push(`Account: ${filterInfo.account}`);
                }
                if (filterInfo.vendor) {
                    filterSummary.push(`Vendor: ${filterInfo.vendor}`);
                }
                
                setPullResult({
                    success: true,
                    message: `Successfully fetched ${data.count} cheque entries${data.total_before_filters !== data.count ? ` (${data.total_before_filters} total, ${data.count} after filters)` : ''}${filterSummary.length > 0 ? `\nFilters: ${filterSummary.join(', ')}` : ''}`,
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
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            const response = await fetch('/api/qbo/disconnect', { 
                method: 'POST',
                headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {},
            })
            if (response.ok) {
                setQboConnected(false)
                setCompanyName(null)
                setCompanyId(null)
                toast.success('Disconnected from QuickBooks. You can now reconnect to a different company.', {
                    duration: 3000,
                    icon: '✅'
                })
                await fetchIntegrationStatus()
                // Reload page to ensure clean state
                setTimeout(() => window.location.reload(), 1500)
            }
        } catch (error) {
            console.error('Failed to disconnect QBO:', error)
            toast.error('Failed to disconnect', { duration: 4000 })
        }
    }

    const handleDiagnose = async () => {
        setDiagnosing(true)
        setDiagnosisResult(null)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Session expired. Please refresh the page.')
                setDiagnosing(false)
                return
            }
            const response = await fetch('/api/qbo/diagnose', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })
            const data = await response.json()
            setDiagnosisResult(data)
            console.log('🔍 QB Diagnosis:', JSON.stringify(data, null, 2))
        } catch (error: any) {
            setDiagnosisResult({ conclusion: `Error: ${error.message}`, steps: [] })
        } finally {
            setDiagnosing(false)
        }
    }

    const handleSaveApiKeys = async () => {
        setSaving(true)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            if (!session) {
                toast.error('Not authenticated. Please log in again.')
                setSaving(false)
                return
            }

            const response = await fetch('/api/settings/integrations', {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({}),
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
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                                    <CheckCircle size={14} />
                                                    <span>Connected to QuickBooks</span>
                                                </div>
                                                {companyName && (
                                                    <div className="text-sm font-semibold text-gray-900 ml-5">
                                                        Company: {companyName}
                                                    </div>
                                                )}
                                                {companyId && (
                                                    <div className="text-xs text-gray-500 ml-5">
                                                        Realm ID: {companyId}
                                                    </div>
                                                )}
                                                <div className="mt-2 ml-5 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                                                    <p className="font-medium mb-1">💡 Multiple Companies?</p>
                                                    <p>To switch to a different QuickBooks company, click "Disconnect" then "Connect to QuickBooks" again and select the company you want to use.</p>
                                                </div>
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

                        {/* Connection Diagnostics */}
                        {qbConfigured && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                                <p className="font-medium text-gray-900 text-sm mb-3">Connection Diagnostics</p>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="flex items-center gap-2">
                                        {credentialsExist ? <CheckCircle size={14} className="text-green-600" /> : <XCircle size={14} className="text-red-500" />}
                                        <span className={credentialsExist ? 'text-green-800' : 'text-red-700'}>
                                            {credentialsExist ? 'Credentials saved in DB' : 'No credentials in DB (using env vars)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {qboConnected ? <CheckCircle size={14} className="text-green-600" /> : <XCircle size={14} className="text-red-500" />}
                                        <span className={qboConnected ? 'text-green-800' : 'text-red-700'}>
                                            {qboConnected ? 'OAuth tokens present' : 'No OAuth tokens'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {companyId ? <CheckCircle size={14} className="text-green-600" /> : <XCircle size={14} className="text-gray-400" />}
                                        <span className={companyId ? 'text-green-800' : 'text-gray-500'}>
                                            {companyId ? `Realm ID: ${companyId}` : 'No company selected'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {companyName ? <CheckCircle size={14} className="text-green-600" /> : <XCircle size={14} className="text-gray-400" />}
                                        <span className={companyName ? 'text-green-800' : 'text-gray-500'}>
                                            {companyName ? `Company: ${companyName}` : 'Company name not fetched'}
                                        </span>
                                    </div>
                                </div>
                                {qboConnected && (
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testingConnection}
                                        className="mt-3 px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {testingConnection ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
                                        Diagnose Connection
                                    </button>
                                )}
                            </div>
                        )}

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
                                        qbConnected={qboConnected}
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
                                                        {pullResult.data.count === 0 && (
                                                            <div className="mt-3 pt-3 border-t border-emerald-200">
                                                                <p className="font-medium text-amber-700 mb-2">⚠️ 0 results found with current filters</p>
                                                                <button
                                                                    onClick={() => handlePullData({})}
                                                                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition"
                                                                >
                                                                    Try All Time (No Filters)
                                                                </button>
                                                                <p className="text-[10px] text-gray-600 mt-1">
                                                                    This will fetch ALL check transactions to verify data exists in QuickBooks
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Diagnose Connection */}
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <button
                                            onClick={handleDiagnose}
                                            disabled={diagnosing}
                                            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition flex items-center gap-2"
                                        >
                                            {diagnosing ? (
                                                <><Loader2 size={14} className="animate-spin" /> Running Diagnostics...</>
                                            ) : (
                                                <><AlertCircle size={14} /> Diagnose Connection (0 results?)</>
                                            )}
                                        </button>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Runs wide-open QB queries with no filters to verify your token, company, and whether data exists.
                                        </p>

                                        {diagnosisResult && (
                                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex-1">
                                                        <p className="font-bold text-amber-900 mb-2">
                                                            🔍 {diagnosisResult.conclusion}
                                                        </p>
                                                        {diagnosisResult.recommendation && (
                                                            <p className="text-xs text-amber-800 bg-amber-100 p-2 rounded border border-amber-300">
                                                                💡 <strong>Next Steps:</strong> {diagnosisResult.recommendation}
                                                            </p>
                                                        )}
                                                        {diagnosisResult.summary && (
                                                            <div className="mt-2 text-xs text-amber-700 flex gap-4">
                                                                <span>✅ {diagnosisResult.summary.successfulSteps} passed</span>
                                                                <span>❌ {diagnosisResult.summary.failedSteps} failed</span>
                                                                <span>📊 {diagnosisResult.summary.totalSteps} total checks</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            const text = JSON.stringify(diagnosisResult, null, 2);
                                                            navigator.clipboard.writeText(text);
                                                            toast.success('Diagnostic report copied to clipboard!', { duration: 2000 });
                                                        }}
                                                        className="ml-3 px-3 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-50 transition flex items-center gap-1 flex-shrink-0"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                        Copy Report
                                                    </button>
                                                </div>
                                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                                    {diagnosisResult.steps?.map((step: any, i: number) => (
                                                        <div key={i} className={`p-2 rounded text-xs ${
                                                            step.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'
                                                        }`}>
                                                            <div className="flex items-center gap-2 font-medium">
                                                                <span>{step.success ? '✅' : '❌'}</span>
                                                                <span>{step.step}</span>
                                                                {step.count !== undefined && (
                                                                    <span className="ml-auto bg-white px-2 py-0.5 rounded text-gray-700">
                                                                        {step.count} results {step.totalCount ? `(${step.totalCount} total)` : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {step.query && (
                                                                <pre className="mt-1 text-[10px] text-gray-600 bg-white p-1 rounded overflow-x-auto">{step.query}</pre>
                                                            )}
                                                            {step.error && (
                                                                <p className="mt-1 text-red-700">{step.error}</p>
                                                            )}
                                                            {step.data && (
                                                                <pre className="mt-1 text-[10px] text-gray-600 bg-white p-1 rounded overflow-x-auto">
                                                                    {JSON.stringify(step.data, null, 2)}
                                                                </pre>
                                                            )}
                                                            {step.sample && step.sample.length > 0 && (
                                                                <details className="mt-1">
                                                                    <summary className="text-[10px] cursor-pointer text-gray-500 hover:text-gray-700">
                                                                        View sample data ({step.sample.length} records)
                                                                    </summary>
                                                                    <pre className="mt-1 text-[10px] text-gray-600 bg-white p-1 rounded overflow-x-auto max-h-40">
                                                                        {JSON.stringify(step.sample, null, 2)}
                                                                    </pre>
                                                                </details>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
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

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading settings...</div>}>
            <SettingsPageContent />
        </Suspense>
    )
}
