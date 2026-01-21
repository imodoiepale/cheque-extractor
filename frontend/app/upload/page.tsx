import UploadDropzone from '@/components/UploadDropzone'

export default function UploadPage() {
    return (
        <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[80vh]">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Checks</h1>
                <p className="text-gray-500 max-w-md mx-auto">
                    Upload scanned checks or PDFs. We&apos;ll extract the data automatically using our dual OCR engine.
                </p>
            </div>

            <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <UploadDropzone />
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center text-sm text-gray-500 w-full max-w-3xl">
                <div className="p-4 bg-gray-50 rounded-lg">
                    <span className="block font-semibold text-gray-900 mb-1">Single & Multi-Scan</span>
                    Upload individual files or pages with multiple checks.
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                    <span className="block font-semibold text-gray-900 mb-1">Secure & Private</span>
                    Everything is encrypted. Your data is safe with us.
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                    <span className="block font-semibold text-gray-900 mb-1">Instant Processing</span>
                    Get results in seconds with 95%+ accuracy.
                </div>
            </div>
        </div>
    )
}
