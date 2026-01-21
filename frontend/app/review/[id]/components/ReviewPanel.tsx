'use client'

import { useState } from 'react'
import ImageViewer from './ImageViewer'
import FieldEditor from './FieldEditor'
import useSWR, { mutate } from 'swr'
import { Check, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ReviewPanelProps {
    checkId: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function ReviewPanel({ checkId }: ReviewPanelProps) {
    const { data: check, error, isLoading } = useSWR(`/api/checks/${checkId}`, fetcher)
    const router = useRouter()
    const [approving, setApproving] = useState(false)

    if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-blue-500" /></div>
    if (error || check?.error) return <div className="text-red-500 p-8">Failed to load check data</div>

    const handleApprove = async () => {
        setApproving(true)
        try {
            await fetch(`/api/checks/${checkId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'status', value: 'approved' })
            })
            router.push('/dashboard')
        } catch {
            alert('Failed to approve')
        } finally {
            setApproving(false)
        }
    }

    const handleFieldUpdate = () => {
        mutate(`/api/checks/${checkId}`)
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
                <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Dashboard
                </Link>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500">
                        Confidence: <span className="font-semibold text-gray-900">{(check.confidence_summary * 100).toFixed(0)}%</span>
                    </div>
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="flex items-center bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        {approving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                        Approve & Finish
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
                <div className="h-full min-h-0">
                    <ImageViewer src={check.image_url} alt="Check Scan" />
                </div>

                <div className="h-full overflow-y-auto pr-2">
                    <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
                        <h2 className="text-xl font-semibold text-gray-900 border-b pb-2">Extracted Data</h2>

                        <div className="space-y-4">
                            <FieldEditor
                                label="Payee"
                                field="payee"
                                value={check.payee}
                                confidence={check.payee_confidence}
                                checkId={checkId}
                                onUpdate={handleFieldUpdate}
                            />

                            <FieldEditor
                                label="Amount"
                                field="amount"
                                type="number"
                                value={check.amount}
                                confidence={check.amount_confidence}
                                checkId={checkId}
                                onUpdate={handleFieldUpdate}
                            />

                            <FieldEditor
                                label="Date"
                                field="check_date"
                                type="date"
                                value={check.check_date}
                                confidence={check.check_date_confidence}
                                checkId={checkId}
                                onUpdate={handleFieldUpdate}
                            />

                            <FieldEditor
                                label="Check Number"
                                field="check_number"
                                value={check.check_number}
                                confidence={check.check_number_confidence}
                                checkId={checkId}
                                onUpdate={handleFieldUpdate}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FieldEditor
                                    label="Routing Number"
                                    field="micr_routing"
                                    value={check.micr_routing}
                                    confidence={check.micr_confidence}
                                    checkId={checkId}
                                    onUpdate={handleFieldUpdate}
                                />
                                <FieldEditor
                                    label="Account Number"
                                    field="micr_account"
                                    value={check.micr_account}
                                    confidence={check.micr_confidence}
                                    checkId={checkId}
                                    onUpdate={handleFieldUpdate}
                                />
                            </div>

                            <FieldEditor
                                label="Bank Name"
                                field="bank"
                                value={check.bank}
                                confidence={check.bank_confidence}
                                checkId={checkId}
                                onUpdate={handleFieldUpdate}
                            />
                        </div>

                        {check.qbo_sync_error && (
                            <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded">
                                Sync Error: {check.qbo_sync_error}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
