'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function UploadDropzone() {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return

        setUploading(true)
        setError(null)
        const file = acceptedFiles[0]
        const formData = new FormData()
        formData.append('file', file)

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            })

            if (!res.ok) {
                throw new Error('Upload failed')
            }

            const data = await res.json()
            // Redirect to dashboard or review page
            router.push('/dashboard')
        } catch (err) {
            setError('Failed to upload file. Please try again.')
            console.error(err)
        } finally {
            setUploading(false)
        }
    }, [router])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/jpeg': [],
            'image/png': [],
            'application/pdf': []
        },
        maxFiles: 1,
        multiple: false
    })

    return (
        <div className="w-full max-w-xl mx-auto">
            <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
            >
                <input {...getInputProps()} />

                <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-gray-100 rounded-full">
                        {uploading ? (
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        ) : (
                            <Upload className="w-8 h-8 text-gray-600" />
                        )}
                    </div>

                    <div>
                        <p className="text-lg font-medium text-gray-900">
                            {uploading ? 'Uploading & Processing...' : 'Drop check here, or click to select'}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                            Supports JPEG, PNG, PDF up to 10MB
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}
        </div>
    )
}
