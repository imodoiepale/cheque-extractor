// import UploadDropzone from '@/components/UploadDropzone'

// export default function UploadPage() {
//     return (
//         <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[80vh]">
//             <div className="text-center mb-10">
//                 <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Checks</h1>
//                 <p className="text-gray-500 max-w-md mx-auto">
//                     Upload scanned checks or PDFs. We&apos;ll extract the data automatically using our dual OCR engine.
//                 </p>
//             </div>

//             <div className="w-full bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
//                 <UploadDropzone />
//             </div>

//             <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center text-sm text-gray-500 w-full max-w-3xl">
//                 <div className="p-4 bg-gray-50 rounded-lg">
//                     <span className="block font-semibold text-gray-900 mb-1">Single & Multi-Scan</span>
//                     Upload individual files or pages with multiple checks.
//                 </div>
//                 <div className="p-4 bg-gray-50 rounded-lg">
//                     <span className="block font-semibold text-gray-900 mb-1">Secure & Private</span>
//                     Everything is encrypted. Your data is safe with us.
//                 </div>
//                 <div className="p-4 bg-gray-50 rounded-lg">
//                     <span className="block font-semibold text-gray-900 mb-1">Instant Processing</span>
//                     Get results in seconds with 95%+ accuracy.
//                 </div>
//             </div>
//         </div>
//     )
// }


'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DropzoneUpload from './components/DropzoneUpload';
import MultiFileQueue from './components/MultiFileQueue';

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const { checkId } = await response.json();

        // Trigger processing
        await fetch('/api/process/' + checkId, {
          method: 'POST',
        });
      }

      // Navigate to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Checks</h1>
        <p className="text-gray-600 mt-2">
          Drag and drop your check images or PDFs to start processing
        </p>
      </div>

      <DropzoneUpload onFilesSelected={handleFilesSelected} />

      {files.length > 0 && (
        <>
          <MultiFileQueue files={files} onRemove={handleRemoveFile} />

          <div className="flex justify-end gap-4">
            <button
              onClick={() => setFiles([])}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={uploading}
            >
              Clear All
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : `Upload ${files.length} Check${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}