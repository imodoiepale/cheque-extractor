'use client';

import { X, FileText } from 'lucide-react';
import { GlassCard, GlassCardTitle, IconButton } from '@/components/ui';

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
    <GlassCard padding="none" className="overflow-hidden">
      <div className="border-b border-glass-hairline px-6 py-4">
        <GlassCardTitle className="text-sm">
          Files Ready to Upload ({files.length})
        </GlassCardTitle>
      </div>
      <div>
        {files.map((file, index) => (
          <div
            key={index}
            className="glass-divider flex items-center justify-between px-6 py-4 transition-colors duration-quick ease-settle hover:bg-brand/[0.045]"
          >
            <div className="flex items-center gap-3">
              <FileText className="text-ink-faint" size={24} />
              <div>
                <p className="font-medium text-ink-strong">{file.name}</p>
                <p className="nums text-sm text-ink-faint">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <IconButton
              aria-label={`Remove ${file.name}`}
              size="icon-sm"
              onClick={() => onRemove(index)}
              className="text-ink-faint hover:text-error-text"
            >
              <X size={18} />
            </IconButton>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
