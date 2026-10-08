'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileCheck2, FileX2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onFilesSelected: (files: File[]) => void;
}

/**
 * The drop target.
 *
 * Three states, all driven by hook booleans rather than classNames, because
 * glassifying only the resting state leaves accept and reject looking broken:
 *
 *   resting  — hairline dashed border over the mesh, neutral glass
 *   accept   — brand ring + brand wash, the file is droppable
 *   reject   — error ring + error wash, the file type is not accepted
 *
 * `isDragReject` is checked before `isDragAccept`: during a drag over a
 * mixed selection react-dropzone reports both, and the refusal is the one
 * the reader needs to see.
 */
export default function DropzoneUpload({ onFilesSelected }: Props) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const state = isDragReject ? 'reject' : isDragAccept || isDragActive ? 'accept' : 'resting';

  return (
    <div
      {...getRootProps()}
      data-drag-state={state}
      aria-invalid={state === 'reject' || undefined}
      className={cn(
        'glass-card press cursor-pointer rounded-card border border-dashed p-12 text-center',
        'transition-[border-color,background-color,box-shadow] duration-quick ease-settle',
        state === 'resting' && 'border-ink-strong/20 hover:border-brand/50',
        // NOT `shadow-glass-selected`: that name exists in tailwind.config.js
        // both as a boxShadow and as the `glass.selected` colour, so it
        // compiles to a shadow *colour* and the glow silently never renders.
        state === 'accept' && 'border-brand bg-brand-wash/80 shadow-brand-glow',
        state === 'reject' && 'border-error bg-error-bg/70 shadow-danger-glow'
      )}
    >
      <input {...getInputProps()} />

      {state === 'reject' ? (
        <>
          <FileX2 className="mx-auto mb-4 text-error" size={48} aria-hidden />
          <p className="text-lg font-medium text-error-text">That file type is not supported</p>
          <p className="mt-1 text-sm text-ink-body">PNG, JPG or PDF only.</p>
        </>
      ) : state === 'accept' ? (
        <>
          <FileCheck2 className="mx-auto mb-4 text-brand" size={48} aria-hidden />
          <p className="text-lg font-medium text-brand-deep">Drop the files here</p>
          <p className="mt-1 text-sm text-ink-body">We&apos;ll detect pages and cheques next.</p>
        </>
      ) : (
        <>
          <Upload className="mx-auto mb-4 text-ink-faint" size={48} aria-hidden />
          <p className="mb-2 text-lg text-ink-strong">
            Drag &amp; drop cheque images here, or click to select
          </p>
          <p className="text-sm text-ink-body">Supports PNG, JPG and PDF, up to 10MB per file.</p>
        </>
      )}
    </div>
  );
}
