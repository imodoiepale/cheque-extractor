'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  originalUrl: string;
  processedUrl: string;
  transformations: string[];
}

export default function PreprocessPreview({ originalUrl, processedUrl, transformations }: Props) {
  const [showProcessed, setShowProcessed] = useState(true);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Image Preprocessing</h3>
        <button
          onClick={() => setShowProcessed(!showProcessed)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          {showProcessed ? <EyeOff size={16} /> : <Eye size={16} />}
          {showProcessed ? 'Show Original' : 'Show Processed'}
        </button>
      </div>

      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
        <img
          src={showProcessed ? processedUrl : originalUrl}
          alt={showProcessed ? 'Processed check' : 'Original check'}
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 px-3 py-1 bg-black/70 text-white text-xs rounded">
          {showProcessed ? 'Processed' : 'Original'}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Applied Transformations:</p>
        <div className="flex flex-wrap gap-2">
          {transformations.map((transform, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
            >
              {transform}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <p className="font-medium mb-1">Preprocessing Steps:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Grayscale conversion for better contrast</li>
          <li>Deskewing to correct image rotation</li>
          <li>Noise reduction using Gaussian blur</li>
          <li>Contrast normalization (CLAHE)</li>
          <li>Adaptive thresholding for text clarity</li>
        </ul>
      </div>
    </div>
  );
}
