'use client'

import { useState } from 'react'
import { Check, Edit2, X } from 'lucide-react'
import ConfidenceBadge from './ConfidenceBadge'

interface FieldEditorProps {
    label: string
    field: string
    value: string | number | null
    confidence: number | null
    checkId: string
    type?: 'text' | 'number' | 'date'
    onUpdate?: () => void
}

export default function FieldEditor({
    label,
    field,
    value,
    confidence,
    checkId,
    type = 'text',
    onUpdate
}: FieldEditorProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [currentValue, setCurrentValue] = useState(value || '')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            await fetch(`/api/checks/${checkId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value: currentValue })
            })
            setIsEditing(false)
            onUpdate?.()
        } catch (error) {
            console.error('Failed to update', error)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="p-4 bg-white rounded-lg border hover:border-blue-300 transition-colors">
            <div className="flex justify-between items-start mb-2">
                <label className="text-sm font-medium text-gray-500">{label}</label>
                <ConfidenceBadge score={confidence} showLabel={false} />
            </div>

            {isEditing ? (
                <div className="flex gap-2">
                    <input
                        type={type}
                        value={currentValue}
                        onChange={(e) => setCurrentValue(e.target.value)}
                        className="flex-1 border rounded px-2 py-1 text-sm"
                        autoFocus
                    />
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                    >
                        <Check className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsEditing(false)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <div className="flex justify-between items-center group">
                    <span className={`text-base font-medium ${!value ? 'text-gray-400 italic' : 'text-gray-900'}`}>
                        {value || 'Empty'}
                    </span>
                    <button
                        onClick={() => setIsEditing(true)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 transition-opacity"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}
