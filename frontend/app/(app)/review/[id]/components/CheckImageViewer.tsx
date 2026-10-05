'use client';

import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { GlassCard, GlassCardTitle, GlassPanel, IconButton } from '@/components/ui';

interface Props {
  imageUrl: string;
}

export default function CheckImageViewer({ imageUrl }: Props) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  return (
    <GlassCard padding="none" className="overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 border-b border-glass-hairline px-4 py-3">
        <GlassCardTitle className="text-base">Check Image</GlassCardTitle>
        <div className="flex items-center gap-1">
          <IconButton aria-label="Zoom out" size="icon-sm" onClick={handleZoomOut} disabled={zoom <= 50} title="Zoom Out">
            <ZoomOut size={18} />
          </IconButton>
          <span className="nums min-w-[3.5rem] text-center text-sm font-medium text-ink-body">
            {zoom}%
          </span>
          <IconButton aria-label="Zoom in" size="icon-sm" onClick={handleZoomIn} disabled={zoom >= 200} title="Zoom In">
            <ZoomIn size={18} />
          </IconButton>
          <span className="mx-2 h-6 w-px bg-glass-hairline" aria-hidden />
          <IconButton aria-label="Rotate" size="icon-sm" onClick={handleRotate} title="Rotate">
            <RotateCw size={18} />
          </IconButton>
        </div>
      </div>

      {/* Image. The zoom/rotate transform is the ONLY inline style — it is
          dynamic maths. Every colour, radius and shadow here is a token, and
          the inner surface is a GlassPanel so nothing blurs twice. */}
      <GlassPanel tone="sunken" radius="card" padding="md" className="scroll-region max-h-[600px] border-0">
        <div className="flex items-center justify-center">
          <div
            className="transition-transform duration-settle ease-settle"
            style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }}
          >
            <img
              src={imageUrl}
              alt="Check"
              className="h-auto max-w-full rounded-input shadow-glass"
            />
          </div>
        </div>
      </GlassPanel>
    </GlassCard>
  );
}
