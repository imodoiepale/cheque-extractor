'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { Plus, Search, FileText, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import ConfidenceBadge from '@/components/ConfidenceBadge'
import { format } from 'date-fns'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function DashboardPage() {
    const { data, error, isLoading } = useSWR('/api/checks?status=all', fetcher)

    if (isLoading) return <div className="p-8">Loading checks...</div>
    if (error) return <div className="p-8 text-red-600">Failed to load checks</div>

    const checks = data?.checks || []

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Check Dashboard</h1>
                    <p className="text-gray-500">Manage and review your processed checks</p>
                </div>
                <Link
                    href="/upload"
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Upload New
                </Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search payee, amount, or check number..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Payee</th>
                            <th className="px-6 py-3 font-medium">Amount</th>
                            <th className="px-6 py-3 font-medium">Date</th>
                            <th className="px-6 py-3 font-medium">Score</th>
                            <th className="px-6 py-3 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {checks.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                    No checks found. Upload one to get started.
                                </td>
                            </tr>
                        ) : (
                            checks.map((check: any) => (
                                <tr key={check.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <StatusIcon status={check.status} />
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        {check.payee || <span className="text-gray-400 italic">Unknown</span>}
                                    </td>
                                    <td className="px-6 py-4 font-medium">
                                        {check.amount
                                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(check.amount)
                                            : '-'
                                        }
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {check.check_date ? format(new Date(check.check_date), 'MMM d, yyyy') : '-'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <ConfidenceBadge score={check.confidence_summary} />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 text-gray-400 group-hover:text-blue-600">
                                            <Link href={`/review/${check.id}`} className="hover:underline">
                                                Review
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case 'approved':
            return <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100"><CheckCircle className="w-3.5 h-3.5" /> Approved</span>
        case 'pending_review':
            return <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-100"><AlertTriangle className="w-3.5 h-3.5" /> Review</span>
        case 'processing':
            return <span className="flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"><Clock className="w-3.5 h-3.5" /> Processing</span>
        default:
            return <span className="text-gray-500 capitalize">{status}</span>
    }
}
