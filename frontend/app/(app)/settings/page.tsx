'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Save, AlertCircle, Key, ExternalLink, CheckCircle, XCircle, Users, Settings as SettingsIcon, Plug, Upload, FileText, Loader2, ShieldCheck, RefreshCw, MoreHorizontal, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { QBCompanySwitcher } from '@/components/QBCompanySwitcher'
import RecoveryCodesCard from '@/components/RecoveryCodesCard'
import QuickBooksFilters, { FilterParams } from '@/components/QuickBooksFilters'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import dynamic from 'next/dynamic'
import {
    Button,
    Dialog,
    Field,
    GlassCard,
    GlassCardTitle,
    GlassPanel,
    Input,
    Select,
    Skeleton,
    ErrorState,
    TabPanel,
    type TabItem,
} from '@/components/ui'
import { useSpelling } from '@/hooks/useSpelling'
import { adminOnly, usePermissions } from '@/hooks/usePermissions'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queries'

const QBDataPreview = dynamic(() => import('@/components/QBDataPreview'), { ssr: false })

const TABS: TabItem[] = [
    { value: 'general', label: 'General', icon: <SettingsIcon size={15} aria-hidden /> },
    { value: 'integrations', label: 'Connections', icon: <Plug size={15} aria-hidden /> },
    { value: 'team', label: 'Team', icon: <Users size={15} aria-hidden /> },
    { value: 'security', label: 'Security', icon: <ShieldCheck size={15} aria-hidden /> },
]

/**
 * Every state colour is verified against its OWN `-bg`, never against white,
 * so the pairing lives in one map instead of being re-typed per callout. This
 * page had eleven ad-hoc `bg-*-50 / border-*-200 / text-*-800` triples.
 */
const NOTICE_TONES = {
    success: 'border-success-border bg-success-bg text-success-text',
    warning: 'border-warning-border bg-warning-bg text-warning-text',
    error: 'border-error-border bg-error-bg text-error-text',
    info: 'border-info-border bg-info-bg text-info-text',
} as const

function Notice({
    tone,
    icon,
    children,
    className = '',
}: {
    tone: keyof typeof NOTICE_TONES
    icon?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`rounded-tile border px-3.5 py-3 text-sm ${NOTICE_TONES[tone]} ${className}`}>
            <div className="flex items-start gap-2.5">
                {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    )
}

/** One diagnostics row. `neutral` means "absent is not a failure". */
function DiagnosticRow({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
    return (
        <p className={`flex items-center gap-2 ${ok ? 'text-success-text' : neutral ? 'text-ink-faint' : 'text-error-text'}`}>
            {ok ? <CheckCircle size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
            <span>{label}</span>
        </p>
    )
}

/** Raw QB payloads. Sunken track, mono, its own scrollbar — never the page's. */
function CodeBlock({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <pre className={`scroll-region mt-1 rounded-input bg-surface-sunken p-1.5 font-mono text-[10px] text-ink-body ${className}`}>
            {children}
        </pre>
    )
}

function SettingsPageContent() {
    const t = useSpelling()
    const queryClient = useQueryClient()
    const [activeTab, setActiveTab] = useState('general')
    const [qboConnected, setQboConnected] = useState(false)
    const canEditAccount = usePermissions().can('account.edit')
    const [qbConfigured, setQbConfigured] = useState(false)
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [companyName, setCompanyName] = useState<string | null>(null)
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [showQBCredentialsDialog, setShowQBCredentialsDialog] = useState(false)
    const [qbClientId, setQbClientId] = useState('')
    const [qbClientSecret, setQbClientSecret] = useState('')
    const QB_REDIRECT_URI = 'https://kyriq.com/api/qbo/callback'
    const [testingConnection, setTestingConnection] = useState(false)
    const [uploadingQBO, setUploadingQBO] = useState(false)
    const [qboUploadResult, setQboUploadResult] = useState<{ success: boolean; message: string } | null>(null)
    const [pullingData, setPullingData] = useState(false)
    const [pullResult, setPullResult] = useState<any>(null)
    const [diagnosing, setDiagnosing] = useState(false)
    const [diagnosisResult, setDiagnosisResult] = useState<any>(null)
    const [exploring, setExploring] = useState(false)
    const [exploreResult, setExploreResult] = useState<any>(null)
    const [previewType, setPreviewType] = useState<string>('Purchase')
    const [previewData, setPreviewData] = useState<any>(null)
    const [loadingPreview, setLoadingPreview] = useState(false)
    const [loadingSettings, setLoadingSettings] = useState(true)
    const [settingsError, setSettingsError] = useState<unknown>(null)
    const [mounted, setMounted] = useState(false)
    const [credentialsExist, setCredentialsExist] = useState(false)
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

    const searchParams = useSearchParams()
    const router = useRouter()

    useEffect(() => {
        setMounted(true)
    }, [])

    // The tab follows the URL on every change, not just the first load. The
    // sidebar's Connections (?tab=integrations) and Settings (no tab) are the
    // same route, so reading ?tab= once left Settings showing Connections.
    useEffect(() => {
        const t = searchParams?.get('tab')
        setActiveTab(t && TABS.some((x) => x.value === t) ? t : 'general')
    }, [searchParams])

    // Parse URL params for OAuth callback results (fire only once)
    const handledOAuthRef = useRef(false)
    useEffect(() => {
        if (!mounted || !searchParams || handledOAuthRef.current) return
        
        const error = searchParams.get('error')
        const success = searchParams.get('success')
        const detail = searchParams.get('detail')
        const tab = searchParams.get('tab')
        const notice = searchParams.get('notice')
        
        if (tab && TABS.some((t) => t.value === tab)) {
            setActiveTab(tab)
        }
        
        if (error) {
            handledOAuthRef.current = true
            const errorMessages: Record<string, string> = {
                company_owned_by_other_firm: `${detail ? decodeURIComponent(detail) : 'This QuickBooks company'} is already connected to another Kyriq firm, and that firm's connection has been kept working. Ask its admin to invite you under Users instead of connecting it again.`,
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

        // Additive to the success toast above: the connection worked, the free
        // trial is what did not apply. Read in the same pass, because the
        // router.replace() in either branch drops the param before a re-run.
        if (notice === 'trial_already_used') {
            handledOAuthRef.current = true
            toast(
                'This QuickBooks company has already had a Kyriq trial, so a new one was not started. The connection is active, choose a plan on the Billing page to keep processing.',
                { duration: 12000, icon: 'ℹ️' }
            )
            router.replace('/settings?tab=integrations', { scroll: false })
        }

        // Where Intuit lands the user after they disconnect Kyriq from inside
        // QuickBooks. Intuit has already severed its side, so this explains the
        // state rather than reporting an error.
        if (notice === 'quickbooks_disconnected') {
            handledOAuthRef.current = true
            toast(
                'QuickBooks was disconnected from the QuickBooks side. Existing data stays in Kyriq, but new syncs will not run until you reconnect.',
                { duration: 12000, icon: 'ℹ️' }
            )
            router.replace('/settings?tab=integrations', { scroll: false })
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
                message: `Imported ${data.imported} ${t('cheque')} entries from ${data.fileName}${data.totalTransactions ? ` (${data.totalTransactions} total transactions)` : ''}`,
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
                setLastSyncedAt(data.lastSyncedAt || null)
                setQbClientId(data.qbClientId || '')
                setQbClientSecret(data.qbClientSecret || '')
                // qbRedirectUri is always fixed — no need to load from DB
                
                // Fetch QB company info if connected but no company name stored
                if (data.qboConnected && !data.companyName) {
                    fetchQBCompanyInfo()
                }
                setSettingsError(null)
            } else {
                throw new Error(`Integration status failed (${response.status})`)
            }
        } catch (error) {
            console.error('Failed to fetch integration status:', error)
            setSettingsError(error)
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
            const rawText = await response.text()
            let data: any
            try { data = JSON.parse(rawText) } catch {
                throw new Error(response.status === 504 || rawText.startsWith('An error')
                    ? 'Request timed out, try a narrower date range or add filters to reduce data volume.'
                    : `Server error (${response.status}): ${rawText.substring(0, 120)}`)
            }
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
                    message: `Successfully fetched ${data.count} ${t('cheque')} entries${data.total_before_filters !== data.count ? ` (${data.total_before_filters} total, ${data.count} after filters)` : ''}${filterSummary.length > 0 ? `\nFilters: ${filterSummary.join(', ')}` : ''}`,
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
                // Refresh everything that depended on the connection, in place
                // (was a full window reload).
                for (const queryKey of [qk.qbConnections, ['qbo-accounts'], ['quickbooks-entries'], qk.matches]) {
                    queryClient.invalidateQueries({ queryKey })
                }
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

    const handleExplore = async () => {
        setExploring(true)
        setExploreResult(null)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Session expired. Please refresh the page.')
                setExploring(false)
                return
            }
            const response = await fetch('/api/qbo/explore', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })
            const data = await response.json()
            setExploreResult(data)
            console.log('🔍 QB Data Explorer:', JSON.stringify(data, null, 2))
        } catch (error: any) {
            setExploreResult({ error: error.message, entities: [] })
        } finally {
            setExploring(false)
        }
    }

    const handlePreview = async (type: string) => {
        setPreviewType(type)
        setLoadingPreview(true)
        setPreviewData(null)
        try {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                toast.error('Session expired. Please refresh the page.')
                setLoadingPreview(false)
                return
            }
            const response = await fetch(`/api/qbo/preview?type=${type}&limit=100`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            })
            const data = await response.json()
            setPreviewData(data)
            console.log(`📊 Preview ${type}:`, data)
        } catch (error: any) {
            toast.error(`Failed to load ${type} preview`)
            setPreviewData({ error: error.message, records: [] })
        } finally {
            setLoadingPreview(false)
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
                    qbRedirectUri: QB_REDIRECT_URI 
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

    const selectTab = (value: string) => {
        setActiveTab(value)
        // Keep ?tab= in step so /settings?tab=integrations and reloads land here.
        router.replace(`/settings?tab=${value}`, { scroll: false })
    }

    return (
        <div className="mx-auto max-w-[1200px] space-y-5 p-5 md:p-8" data-tone="brand">
            <h1 className="font-heading text-2xl font-semibold text-ink-strong">Settings</h1>

            <div className="flex flex-col gap-6 md:flex-row">
                {/* Secondary settings menu. */}
                <nav aria-label="Settings sections" className="md:w-48 md:shrink-0">
                    <div role="tablist" aria-orientation="vertical" className="flex gap-1 overflow-x-auto md:flex-col">
                        {TABS.map((tab) => {
                            const active = activeTab === tab.value
                            return (
                                <button
                                    key={tab.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => selectTab(tab.value)}
                                    className={`press flex min-h-tap items-center gap-2 whitespace-nowrap rounded-input px-3 text-sm font-medium transition-colors duration-tap focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                                        active
                                            ? 'bg-brand/[0.1] text-brand-dark'
                                            : 'text-ink-body hover:bg-ink-strong/[0.04] hover:text-ink-strong'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </nav>

                <div className="min-w-0 flex-1 space-y-5">
            {/* ── General ─────────────────────────────── */}
            <TabPanel value="general" active={activeTab} className="space-y-5">
                <GlassCard padding="lg" className="space-y-4">
                    <GlassCardTitle>Export preferences</GlassCardTitle>

                    <Field label="Default export status" htmlFor="export-status">
                        <Select id="export-status" className="sm:max-w-xs">
                            <option>Draft</option>
                            <option>Ready to Post</option>
                        </Select>
                    </Field>

                    <label htmlFor="auto-export" className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-body">
                        <input
                            type="checkbox"
                            id="auto-export"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border border-glass-hairline bg-surface accent-primary"
                        />
                        <span>{t('Auto-export approved cheques (when confidence > 95%)')}</span>
                    </label>

                    <div className="flex justify-end">
                        <Button size="sm" icon={<Save className="h-4 w-4" />}>Save changes</Button>
                    </div>
                </GlassCard>

                {/*
                  The matching-preferences panel from the v12/v17 prototype is
                  deliberately NOT here (client decision; CHECKLIST 3 moves the
                  auto-approve threshold to the Review step). check-parcel-d.ts
                  fails if this panel reappears.
                */}
            </TabPanel>

            {/* ── Connections (tab value stays 'integrations' for ?tab=) ── */}
            <TabPanel value="integrations" active={activeTab} className="space-y-5">
                {settingsError != null && !loadingSettings && (
                    <ErrorState surface="banner" title="Couldn’t load your QuickBooks connection" error={settingsError}
                        onRetry={() => { setLoadingSettings(true); return fetchIntegrationStatus() }} />
                )}

                {/* QuickBooks Online */}
                <GlassCard padding="lg" className="space-y-4">
                    {loadingSettings ? (
                        <div className="space-y-3" aria-busy>
                            <Skeleton shape="text" className="w-36" />
                            <Skeleton shape="line" className="w-56" />
                            <Skeleton shape="pill" className="h-9 w-40" />
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-3">
                                    <GlassCardTitle>QuickBooks Online</GlassCardTitle>
                                    {qboConnected && <QBCompanySwitcher />}
                                </div>
                                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                                    <dt className="text-ink-soft">Company</dt>
                                    <dd className="font-medium text-ink-strong">{qboConnected ? companyName || 'Name not available' : '-'}</dd>
                                    <dt className="text-ink-soft">Status</dt>
                                    <dd>
                                        {qboConnected ? (
                                            <span className="inline-flex items-center gap-1.5 text-success-text">
                                                <CheckCircle size={14} aria-hidden /> Connected
                                            </span>
                                        ) : qbConfigured ? (
                                            <span className="inline-flex items-center gap-1.5 text-warning-text">
                                                <AlertCircle size={14} aria-hidden /> Not connected
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 text-ink-soft">
                                                <XCircle size={14} aria-hidden /> Not set up
                                            </span>
                                        )}
                                    </dd>
                                    <dt className="text-ink-soft">Last synced</dt>
                                    <dd className="text-ink-body">
                                        {lastSyncedAt && !Number.isNaN(new Date(lastSyncedAt).getTime())
                                            ? new Date(lastSyncedAt).toLocaleString()
                                            : 'Not synced yet'}
                                    </dd>
                                </dl>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {qboConnected ? (
                                    <>
                                        <Button
                                            size="sm"
                                            onClick={() => handlePullData({})}
                                            loading={pullingData}
                                            icon={<RefreshCw size={14} />}
                                        >
                                            Sync transactions
                                        </Button>
                                        <details className="relative">
                                            <summary
                                                aria-label="Manage connection"
                                                className="press flex min-h-tap cursor-pointer list-none items-center rounded-input border border-glass-hairline bg-surface px-2.5 text-ink-body hover:text-ink-strong [&::-webkit-details-marker]:hidden"
                                            >
                                                <MoreHorizontal size={16} aria-hidden />
                                            </summary>
                                            <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-input border border-glass-hairline bg-surface py-1 shadow-contact">
                                                <button
                                                    type="button"
                                                    onClick={handleTestConnection}
                                                    disabled={testingConnection}
                                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-body hover:bg-brand/[0.06] disabled:opacity-disabled"
                                                >
                                                    <Plug size={14} aria-hidden /> Test connection
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDisconnectConfirm(true)}
                                                    disabled={!canEditAccount}
                                                    title={canEditAccount ? undefined : adminOnly('disconnect QuickBooks')}
                                                    className="flex w-full items-center gap-2 border-t border-glass-hairline px-3 py-2 text-left text-sm text-error-text hover:bg-error-bg disabled:cursor-not-allowed disabled:opacity-disabled disabled:hover:bg-transparent"
                                                >
                                                    <XCircle size={14} aria-hidden /> Disconnect
                                                </button>
                                            </div>
                                        </details>
                                    </>
                                ) : (
                                    <>
                                        {qbConfigured && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={handleTestConnection}
                                                loading={testingConnection}
                                                icon={<Plug size={14} />}
                                            >
                                                Test connection
                                            </Button>
                                        )}
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setShowQBCredentialsDialog(true)}
                                            icon={<Key size={14} />}
                                        >
                                            Configure credentials
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleQBOConnect}
                                            icon={<ExternalLink size={14} />}
                                            disabled={!canEditAccount}
                                            title={canEditAccount ? undefined : adminOnly('connect QuickBooks')}
                                        >
                                            Connect to QuickBooks
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {pullResult && (
                        <Notice
                            tone={pullResult.success ? 'success' : 'error'}
                            icon={pullResult.success
                                ? <CheckCircle size={18} aria-hidden />
                                : <AlertCircle size={18} aria-hidden />}
                        >
                            <p className="whitespace-pre-line text-sm font-medium">{pullResult.message}</p>
                            {pullResult.success && pullResult.data && (
                                <div className="mt-2 text-xs">
                                    <ul className="nums space-y-0.5">
                                        <li>{t('Cheques written:')} {pullResult.data.breakdown?.cheques_written || 0}</li>
                                        <li>{t('Bills paid by cheque:')} {pullResult.data.breakdown?.bills_paid_by_cheque || 0}</li>
                                        <li>{t('Cheques received:')} {pullResult.data.breakdown?.cheques_received || 0}</li>
                                    </ul>
                                    {pullResult.data.count === 0 && (
                                        <div className="mt-3 border-t border-success-border pt-3">
                                            <p className="mb-2 font-semibold text-warning-text">
                                                No results found with the current filters
                                            </p>
                                            <Button size="sm" onClick={() => handlePullData({})}>
                                                Try all time (no filters)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Notice>
                    )}

                    {/* Filtered sync */}
                    {qboConnected && (
                        <details className="group border-t border-glass-hairline pt-4">
                            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-body hover:text-ink-strong [&::-webkit-details-marker]:hidden">
                                <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
                                Sync with filters
                            </summary>
                            <div className="mt-3">
                                <QuickBooksFilters
                                    onApplyFilters={handlePullData}
                                    isLoading={pullingData}
                                    qbConnected={qboConnected}
                                />
                            </div>
                        </details>
                    )}

                    {/* Advanced: developer diagnostics, collapsed by default. */}
                    {qbConfigured && (
                        <details className="group border-t border-glass-hairline pt-4">
                            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-body hover:text-ink-strong [&::-webkit-details-marker]:hidden">
                                <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden />
                                Advanced
                            </summary>

                            <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                                    <DiagnosticRow
                                        ok={credentialsExist}
                                        label={credentialsExist ? 'App credentials saved' : 'Using default app credentials'}
                                    />
                                    <DiagnosticRow
                                        ok={qboConnected}
                                        label={qboConnected ? 'Authorised with QuickBooks' : 'Not authorised'}
                                    />
                                    <DiagnosticRow
                                        ok={Boolean(companyId)}
                                        neutral
                                        label={companyId ? `Realm ID: ${companyId}` : 'No company selected'}
                                    />
                                    <DiagnosticRow
                                        ok={Boolean(companyName)}
                                        neutral
                                        label={companyName ? `Company: ${companyName}` : 'Company name not fetched'}
                                    />
                                </div>

                                {qboConnected && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleDiagnose}
                                            loading={diagnosing}
                                            icon={<AlertCircle size={14} />}
                                        >
                                            {diagnosing ? 'Running diagnostics…' : 'Diagnose connection'}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleExplore}
                                            loading={exploring}
                                            icon={<ExternalLink size={14} />}
                                        >
                                            {exploring ? 'Exploring all data…' : 'Explore QuickBooks data'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowQBCredentialsDialog(true)}
                                            icon={<Key size={14} />}
                                        >
                                            App credentials
                                        </Button>
                                    </div>
                                )}

                                {diagnosisResult && (
                                    <Notice tone="warning">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="mb-2 text-sm font-semibold">{diagnosisResult.conclusion}</p>
                                                {diagnosisResult.recommendation && (
                                                    <p className="rounded-input border border-warning-border bg-warning-bg/60 p-2 text-xs">
                                                        <strong>Next steps:</strong> {diagnosisResult.recommendation}
                                                    </p>
                                                )}
                                                {diagnosisResult.summary && (
                                                    <div className="nums mt-2 flex flex-wrap gap-3 text-xs">
                                                        <span>{diagnosisResult.summary.successfulSteps} passed</span>
                                                        <span>{diagnosisResult.summary.failedSteps} failed</span>
                                                        <span>{diagnosisResult.summary.totalSteps} total checks</span>
                                                    </div>
                                                )}
                                                {diagnosisResult.entitiesWithData && diagnosisResult.entitiesWithData.length > 0 && (
                                                    <div className="mt-3 rounded-input border border-success-border bg-success-bg p-2 text-xs text-success-text">
                                                        <p className="mb-1 font-semibold">Data found in QuickBooks:</p>
                                                        <ul className="nums space-y-0.5">
                                                            {diagnosisResult.entitiesWithData.map((item: any, i: number) => (
                                                                <li key={i}>
                                                                    <strong>{item.type}</strong>: {item.count.toLocaleString()} records, {item.description}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {diagnosisResult.entitiesWithData && diagnosisResult.entitiesWithData.length === 0 && (
                                                    <p className="mt-3 rounded-input border border-error-border bg-error-bg p-2 text-xs font-medium text-error-text">
                                                        No data found in any QuickBooks entity type. This company appears to be empty, or you are connected to the wrong company.
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="shrink-0"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(JSON.stringify(diagnosisResult, null, 2));
                                                    toast.success('Diagnostic report copied to clipboard', { duration: 2000 });
                                                }}
                                            >
                                                Copy report
                                            </Button>
                                        </div>
                                        <div className="scroll-region mt-3 max-h-96 space-y-2">
                                            {diagnosisResult.steps?.map((step: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className={`rounded-input border p-2 text-xs ${step.success
                                                        ? 'border-success-border bg-success-bg text-success-text'
                                                        : 'border-error-border bg-error-bg text-error-text'}`}
                                                >
                                                    <div className="flex items-center gap-2 font-medium">
                                                        {step.success
                                                            ? <CheckCircle size={12} aria-hidden />
                                                            : <XCircle size={12} aria-hidden />}
                                                        <span>{step.step}</span>
                                                        {step.count !== undefined && (
                                                            <span className="nums ml-auto rounded-full bg-surface px-2 py-0.5 text-ink-body">
                                                                {step.count} results {step.totalCount ? `(${step.totalCount} total)` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {step.query && <CodeBlock>{step.query}</CodeBlock>}
                                                    {step.error && <p className="mt-1 text-error-text">{step.error}</p>}
                                                    {step.data && <CodeBlock>{JSON.stringify(step.data, null, 2)}</CodeBlock>}
                                                    {step.sample && step.sample.length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-ink-faint hover:text-ink-body">
                                                                View sample data ({step.sample.length} records)
                                                            </summary>
                                                            <CodeBlock className="max-h-40">{JSON.stringify(step.sample, null, 2)}</CodeBlock>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </Notice>
                                )}

                                {exploreResult && (
                                    <Notice tone="info">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="mb-2 text-sm font-semibold">
                                                    Company: {exploreResult.company?.name || 'Unknown'}
                                                </p>
                                                {exploreResult.summary && (
                                                    <div className="nums mb-2 flex flex-wrap gap-3 text-xs">
                                                        <span>{exploreResult.summary.entitiesWithData} have data</span>
                                                        <span>{exploreResult.summary.entitiesWithoutData} empty</span>
                                                        <span>{exploreResult.summary.totalEntitiesChecked} total</span>
                                                    </div>
                                                )}
                                                {exploreResult.hasData && exploreResult.hasData.length > 0 && (
                                                    <div className="rounded-input border border-info-border bg-info-bg/60 p-2 text-xs">
                                                        <p className="mb-1 font-semibold">Data found in:</p>
                                                        <ul className="nums space-y-0.5">
                                                            {exploreResult.hasData.map((item: any, i: number) => (
                                                                <li key={i}>
                                                                    <strong>{item.type}</strong>: {item.count.toLocaleString()} records, {item.description}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="shrink-0"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(JSON.stringify(exploreResult, null, 2));
                                                    toast.success('Exploration report copied', { duration: 2000 });
                                                }}
                                            >
                                                Copy report
                                            </Button>
                                        </div>
                                        <div className="scroll-region mt-3 max-h-96 space-y-2">
                                            {exploreResult.entities?.map((entity: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className={`rounded-input border p-2 text-xs ${entity.totalCount > 0
                                                        ? 'border-success-border bg-success-bg text-success-text'
                                                        : 'border-glass-hairline bg-surface-sunken text-ink-body'}`}
                                                >
                                                    <div className="flex flex-wrap items-center gap-2 font-medium">
                                                        <span className="font-semibold">{entity.entityType}</span>
                                                        <span className="opacity-80">{entity.description}</span>
                                                        {entity.totalCount !== undefined && (
                                                            <span className="nums ml-auto rounded-full bg-surface px-2 py-0.5 text-ink-body">
                                                                {entity.totalCount.toLocaleString()} total
                                                            </span>
                                                        )}
                                                    </div>
                                                    {entity.error && <p className="mt-1 text-error-text">{entity.error}</p>}
                                                    {entity.samples && entity.samples.length > 0 && (
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-ink-faint hover:text-ink-body">
                                                                View sample data ({entity.samples.length} records)
                                                            </summary>
                                                            <CodeBlock className="max-h-40">{JSON.stringify(entity.samples, null, 2)}</CodeBlock>
                                                        </details>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </Notice>
                                )}

                                {exploreResult && exploreResult.entitiesWithData && exploreResult.entitiesWithData.length > 0 && (
                                    <div className="border-t border-glass-hairline pt-4">
                                        <p className="mb-3 text-sm font-semibold text-ink-strong">Preview data</p>
                                        <div className="mb-3 flex flex-wrap gap-2">
                                            {exploreResult.entitiesWithData.map((entity: any) => (
                                                <Button
                                                    key={entity.type}
                                                    size="sm"
                                                    variant={previewType === entity.type ? 'primary' : 'secondary'}
                                                    onClick={() => handlePreview(entity.type)}
                                                >
                                                    <span className="nums">{entity.type} ({entity.count.toLocaleString()})</span>
                                                </Button>
                                            ))}
                                        </div>

                                        {loadingPreview ? (
                                            <p className="flex items-center justify-center gap-2 py-8 text-sm text-ink-faint">
                                                <Loader2 className="animate-spin" size={16} aria-hidden />
                                                Loading {previewType} data…
                                            </p>
                                        ) : previewData?.records ? (
                                            <QBDataPreview
                                                entityType={previewType}
                                                data={previewData.records}
                                                totalCount={previewData.totalCount}
                                            />
                                        ) : previewData?.error ? (
                                            <p className="py-8 text-center text-sm text-error-text">
                                                Error loading {previewType}: {previewData.error}
                                            </p>
                                        ) : (
                                            <p className="py-8 text-center text-sm text-ink-faint">
                                                Choose an entity type to preview its data
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </details>
                    )}
                </GlassCard>

                {/* Import from file: a separate, concise card. */}
                <GlassCard padding="lg" className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <GlassCardTitle className="flex items-center gap-2">
                                <FileText size={18} aria-hidden />
                                Import from file
                            </GlassCardTitle>
                            <p className="mt-1 text-sm text-ink-soft">.qbo, .ofx or .qfx from your bank</p>
                        </div>
                        <label className={`press relative inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-input border border-glass-hairline bg-surface px-3 text-sm font-medium text-ink-strong hover:bg-brand/[0.06] focus-within:ring-[3px] focus-within:ring-ring/50 ${uploadingQBO ? 'pointer-events-none opacity-disabled' : ''}`}>
                            <input
                                type="file"
                                accept=".qbo,.ofx,.qfx"
                                onChange={handleQBOFileUpload}
                                className="sr-only"
                                disabled={uploadingQBO}
                                aria-label="Upload a .qbo, .ofx or .qfx file"
                            />
                            {uploadingQBO
                                ? <Loader2 size={14} className="animate-spin" aria-hidden />
                                : <Upload size={14} aria-hidden />}
                            {uploadingQBO ? 'Parsing file…' : 'Choose file'}
                        </label>
                    </div>

                    {qboUploadResult && (
                        <Notice
                            tone={qboUploadResult.success ? 'success' : 'error'}
                            icon={qboUploadResult.success
                                ? <CheckCircle size={18} aria-hidden />
                                : <AlertCircle size={18} aria-hidden />}
                        >
                            <p className="text-sm">{qboUploadResult.message}</p>
                        </Notice>
                    )}
                </GlassCard>
            </TabPanel>

            {/* ── Team ────────────────────────────────── */}
            <TabPanel value="team" active={activeTab}>
                <GlassCard padding="lg" className="space-y-4">
                    <GlassCardTitle>Team management</GlassCardTitle>
                    <p className="text-sm text-ink-body">
                        Invite administrators and users, change roles, and remove access.
                        Administrator only.
                    </p>
                    <Link href="/settings/team" className="inline-flex">
                        <Button size="sm" icon={<Users size={16} />}>Open team management</Button>
                    </Link>
                </GlassCard>
            </TabPanel>

            {/* ── Security ────────────────────────────── */}
            <TabPanel value="security" active={activeTab}>
                <GlassCard padding="lg" className="space-y-4">
                    <GlassCardTitle>Two-factor authentication</GlassCardTitle>
                    <p className="text-sm text-ink-body">
                        Kyriq uses an authenticator app (TOTP) for two-factor authentication.
                        It is <strong className="text-ink-strong">required for administrators</strong>, an
                        administrator signing in without it is sent to set it up before any
                        page loads.
                    </p>
                    <Link href="/mfa" className="inline-flex">
                        <Button size="sm" icon={<ShieldCheck size={16} />}>
                            Manage two-factor authentication
                        </Button>
                    </Link>
                    <p className="text-xs text-ink-faint">
                        Lost your authenticator? Use a recovery code on that page. Each code
                        works once and removes the old authenticator so you can set up a new one.
                    </p>
                    <RecoveryCodesCard />
                </GlassCard>
            </TabPanel>
                </div>
            </div>

            {/* ── Disconnect confirmation ─────────────── */}
            <Dialog
                open={showDisconnectConfirm}
                onClose={() => setShowDisconnectConfirm(false)}
                size="sm"
                title="Disconnect QuickBooks?"
                description="Existing data stays in Kyriq. New syncs stop until you reconnect."
                footer={
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setShowDisconnectConfirm(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => { setShowDisconnectConfirm(false); handleQBODisconnect() }}
                        >
                            Disconnect
                        </Button>
                    </>
                }
            >
                {companyName ? <p className="text-sm text-ink-body">{companyName}</p> : null}
            </Dialog>

            {/* ── QuickBooks credentials dialog ───────── */}
            <Dialog
                open={showQBCredentialsDialog}
                onClose={() => setShowQBCredentialsDialog(false)}
                size="xl"
                title="QuickBooks app credentials"
                description="Configure your QuickBooks OAuth credentials"
                footer={
                    <>
                        <Button variant="ghost" size="sm" onClick={() => setShowQBCredentialsDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveQBCredentials}
                            loading={saving}
                            disabled={!qbClientId || !qbClientSecret}
                            icon={<Save size={16} />}
                        >
                            {saving ? 'Saving…' : 'Save credentials'}
                        </Button>
                    </>
                }
            >
                <div className="scroll-region max-h-[60vh] space-y-4 pr-1">
                    {credentialsExist && (
                        <Notice tone="success" icon={<CheckCircle size={18} aria-hidden />}>
                            <p className="font-semibold">Credentials exist</p>
                            <p className="mt-0.5 text-xs">
                                QuickBooks credentials are already saved. You can update them below if needed.
                            </p>
                        </Notice>
                    )}

                    <Notice tone="info" icon={<AlertCircle size={18} aria-hidden />}>
                        <p className="font-semibold">Get your credentials from:</p>
                        <a
                            href="https://developer.intuit.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline underline-offset-2"
                        >
                            developer.intuit.com
                        </a>
                    </Notice>

                    <Field label="Client ID" htmlFor="qb-client-id" required>
                        <div className="relative">
                            <Key className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={16} aria-hidden />
                            <Input
                                id="qb-client-id"
                                type="text"
                                value={qbClientId}
                                onChange={(e) => setQbClientId(e.target.value)}
                                placeholder="Enter your QuickBooks Client ID"
                                className="pl-9"
                            />
                        </div>
                    </Field>

                    <Field label="Client Secret" htmlFor="qb-client-secret" required>
                        <div className="relative">
                            <Key className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={16} aria-hidden />
                            <Input
                                id="qb-client-secret"
                                type="password"
                                value={qbClientSecret}
                                onChange={(e) => setQbClientSecret(e.target.value)}
                                placeholder="Enter your QuickBooks Client Secret"
                                className="pl-9"
                            />
                        </div>
                    </Field>

                    <Field
                        label="Redirect URI"
                        hint="Auto-configured, add this exact URL to your QuickBooks app's Redirect URIs"
                    >
                        <GlassPanel tone="sunken" radius="input" padding="none" className="px-3.5 py-2.5">
                            <span className="select-all font-mono text-sm text-ink-body">{QB_REDIRECT_URI}</span>
                        </GlassPanel>
                    </Field>
                </div>
            </Dialog>
        </div>
    )
}

export default function SettingsPage() {
    return (
        <Suspense
            fallback={
                <div className="mx-auto max-w-6xl space-y-4 p-5">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-11 w-full max-w-xl" />
                    <Skeleton className="h-48 w-full" />
                </div>
            }
        >
            <SettingsPageContent />
        </Suspense>
    )
}
