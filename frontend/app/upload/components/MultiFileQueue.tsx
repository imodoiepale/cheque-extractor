'use client';

import { X, FileText } from 'lucide-react';

interface Props {
  files: File[];
  onRemove: (index: number) => void;
}

export default function MultiFileQueue({ files, onRemove }: Props) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b">
        <h3 className="font-semibold">Files Ready to Upload ({files.length})</h3>
      </div>
      <div className="divide-y">
        {files.map((file, index) => (
          <div key={index} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <FileText className="text-gray-400" size={24} />
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={() => onRemove(index)}
              className="text-gray-400 hover:text-red-600"
            >
              <X size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}