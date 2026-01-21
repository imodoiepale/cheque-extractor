'use client'

interface ConfidenceBadgeProps {
    score: number | null
    showLabel?: boolean
}

export default function ConfidenceBadge({ score, showLabel = true }: ConfidenceBadgeProps) {
    if (score === null) return null

    let colorClass = 'bg-gray-100 text-gray-800'
    let label = 'Unknown'

    if (score >= 0.9) {
        colorClass = 'bg-green-100 text-green-800'
        label = 'High'
    } else if (score >= 0.7) {
        colorClass = 'bg-yellow-100 text-yellow-800'
        label = 'Review'
    } else {
        colorClass = 'bg-red-100 text-red-800'
        label = 'Low'
    }

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
            {showLabel && <span className="mr-1">{label}</span>}
            {(score * 100).toFixed(0)}%
        </span>
    )
}
