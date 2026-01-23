'use client';

import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

interface UploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  checkId?: string;
  error?: string;
}

interface Props {
  files: File[];
  onComplete?: (checkIds: string[]) => void;
}

export default function UploadProgress({ files, onComplete }: Props) {
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Initialize upload statuses
    setUploads(files.map(file => ({
      file,
      status: 'pending',
      progress: 0,
    })));
  }, [files]);

  useEffect(() => {
    if (uploads.length > 0 && !isUploading) {
      startUploads();
    }
  }, [uploads.length]);

  const startUploads = async () => {
    setIsUploading(true);
    const completedIds: string[] = [];

    for (let i = 0; i < uploads.length; i++) {
      const upload = uploads[i];
      
      try {
        // Update to uploading
        updateUploadStatus(i, { status: 'uploading', progress: 0 });

        // Upload file
        const formData = new FormData();
        formData.append('file', upload.file);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }

        const { checkId } = await uploadResponse.json();
        
        updateUploadStatus(i, { 
          status: 'processing', 
          progress: 50,
          checkId 
        });

        // Trigger processing
        const processResponse = await fetch(`/api/process/${checkId}`, {
          method: 'POST',
        });

        if (!processResponse.ok) {
          throw new Error('Processing failed to start');
        }

        updateUploadStatus(i, { 
          status: 'complete', 
          progress: 100 
        });

        completedIds.push(checkId);

      } catch (error: any) {
        updateUploadStatus(i, { 
          status: 'error', 
          error: error.message 
        });
      }
    }

    setIsUploading(false);
    
    if (onComplete && completedIds.length > 0) {
      onComplete(completedIds);
    }
  };

  const updateUploadStatus = (index: number, updates: Partial<UploadStatus>) => {
    setUploads(prev => prev.map((upload, i) => 
      i === index ? { ...upload, ...updates } : upload
    ));
  };

  const getStatusIcon = (status: UploadStatus['status']) => {
    switch (status) {
      case 'complete':
        return <Check className="text-green-600" size={20} />;
      case 'error':
        return <X className="text-red-600" size={20} />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="text-blue-600 animate-spin" size={20} />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusText = (upload: UploadStatus) => {
    switch (upload.status) {
      case 'pending':
        return 'Waiting...';
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return upload.error || 'Failed';
    }
  };

  const getStatusColor = (status: UploadStatus['status']) => {
    switch (status) {
      case 'complete':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'uploading':
      case 'processing':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-4">
      {uploads.map((upload, index) => (
        <div 
          key={index}
          className={`border rounded-lg p-4 transition ${getStatusColor(upload.status)}`}
        >
          <div className="flex items-center gap-4">
            {/* Status Icon */}
            <div className="flex-shrink-0">
              {getStatusIcon(upload.status)}
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {upload.file.name}
              </p>
              <p className="text-sm text-gray-600">
                {getStatusText(upload)}
              </p>
            </div>

            {/* Progress */}
            {(upload.status === 'uploading' || upload.status === 'processing') && (
              <div className="flex-shrink-0 text-sm font-medium text-blue-600">
                {upload.progress}%
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {(upload.status === 'uploading' || upload.status === 'processing') && (
            <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}